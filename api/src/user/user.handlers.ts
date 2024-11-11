import type express from 'express';
import chroma from 'chroma-js';
import { and, eq } from 'drizzle-orm';
import z from 'zod';

import { worksheetCoursesToWorksheets } from './user.utils.js';

import {
  studentBluebookSettings,
  worksheetCourses,
  worksheets,
} from '../../drizzle/schema.js';
import { db } from '../config.js';
import winston from '../logging/winston.js';

const UpdateWorksheetCourseReqItemSchema = z.intersection(
  z.object({
    season: z.string().transform((val) => parseInt(val, 10)),
    worksheetNumber: z.number(),
    crn: z.number(),
  }),
  z.union([
    z.object({
      action: z.literal('add'),
      color: z.string().refine((val) => chroma.valid(val)),
      hidden: z.boolean(),
    }),
    z.object({
      action: z.literal('remove'),
      // We still allow these because the frontend sends them (it just sends
      // everything about the course for both add and remove)
      color: z
        .string()
        .refine((val) => chroma.valid(val))
        .optional(), // Ignored
      hidden: z.boolean().optional(), // Ignored
    }),
    z.object({
      action: z.literal('update'),
      color: z
        .string()
        .refine((val) => chroma.valid(val))
        .optional(),
      hidden: z.boolean().optional(),
    }),
  ]),
);

const UpdateWorksheetCoursesReqBodySchema = z.union([
  UpdateWorksheetCourseReqItemSchema,
  z.array(UpdateWorksheetCourseReqItemSchema),
]);

async function updateWorksheetCourse(
  {
    action,
    season,
    crn,
    worksheetNumber,
    color,
    hidden,
  }: z.infer<typeof UpdateWorksheetCourseReqItemSchema>,
  netId: string,
): Promise<string | undefined> {
  const [existing] = await db
    .selectDistinctOn([
      worksheetCourses.netId,
      worksheetCourses.crn,
      worksheetCourses.season,
      worksheetCourses.worksheetNumber,
    ])
    .from(worksheetCourses)
    .where(
      and(
        eq(worksheetCourses.netId, netId),
        eq(worksheetCourses.crn, crn),
        eq(worksheetCourses.season, season),
        eq(worksheetCourses.worksheetNumber, worksheetNumber),
      ),
    );

  if (action === 'add') {
    winston.info(
      `Bookmarking course ${crn} in season ${season} for user ${netId} in worksheet ${worksheetNumber}`,
    );
    if (existing) return 'ALREADY_BOOKMARKED';
    await db.insert(worksheetCourses).values({
      netId,
      crn,
      season,
      worksheetNumber,
      color,
      hidden,
    });
  } else if (action === 'remove') {
    winston.info(
      `Removing bookmark for course ${crn} in season ${season} for user ${netId} in worksheet ${worksheetNumber}`,
    );
    if (!existing) return 'NOT_BOOKMARKED';
    await db
      .delete(worksheetCourses)
      .where(
        and(
          eq(worksheetCourses.netId, netId),
          eq(worksheetCourses.crn, crn),
          eq(worksheetCourses.season, season),
          eq(worksheetCourses.worksheetNumber, worksheetNumber),
        ),
      );
  } else {
    // Update data of a bookmarked course
    winston.info(
      `Updating bookmark for course ${crn} in season ${season} for user ${netId} in worksheet ${worksheetNumber}`,
    );
    if (!existing) return 'NOT_BOOKMARKED';
    await db
      .update(worksheetCourses)
      // Currently the frontend is not capable of actually syncing the hidden
      // state so we keep it as null. This allows it to be properly synced in
      // the future
      .set({ color, hidden })
      .where(
        and(
          eq(worksheetCourses.netId, netId),
          eq(worksheetCourses.crn, crn),
          eq(worksheetCourses.season, season),
          eq(worksheetCourses.worksheetNumber, worksheetNumber),
        ),
      );
  }
  return undefined;
}

export const updateWorksheetCourses = async (
  req: express.Request,
  res: express.Response,
): Promise<void> => {
  winston.info('Toggling course bookmark');

  const { netId } = req.user!;

  const bodyParseRes = UpdateWorksheetCoursesReqBodySchema.safeParse(req.body);
  if (!bodyParseRes.success) {
    res.status(400).json({ error: 'INVALID_REQUEST' });
    return;
  }
  if (!Array.isArray(bodyParseRes.data)) {
    const result = await updateWorksheetCourse(bodyParseRes.data, netId);
    if (result) {
      res.status(400).json({ error: result });
      return;
    }
  } else {
    const results = await Promise.all(
      bodyParseRes.data.map((item) => updateWorksheetCourse(item, netId)),
    );
    if (results.some((r) => r !== undefined)) {
      res.status(400).json({
        error: Object.fromEntries(
          [...results.entries()].filter((x) => x[1] !== undefined),
        ),
      });
      return;
    }
  }
  res.sendStatus(200);
};

export const getUserWorksheet = async (
  req: express.Request,
  res: express.Response,
): Promise<void> => {
  winston.info(`Fetching user's worksheets`);

  const { netId } = req.user!;

  winston.info(`Getting profile for user ${netId}`);
  const [studentProfile] = await db
    .selectDistinctOn([studentBluebookSettings.netId])
    .from(studentBluebookSettings)
    .where(eq(studentBluebookSettings.netId, netId));

  winston.info(`Getting worksheets for user ${netId}`);

  const worksheets = await db
    .select()
    .from(worksheetCourses)
    .where(eq(worksheetCourses.netId, netId));

  res.json({
    netId,
    evaluationsEnabled: studentProfile?.evaluationsEnabled ?? null,
    year: studentProfile?.year ?? null,
    school: studentProfile?.school ?? null,
    data: worksheetCoursesToWorksheets(worksheets)[netId] ?? {},
  });
};

const AddWorksheetSchema = z.object({
  action: z.literal('add'),
  worksheetName: z.string().max(64),
});

const DeleteWorksheetSchema = z.object({
  action: z.literal('delete'),
  worksheetNumber: z.number(),
});

const RenameWorksheetSchema = z.object({
  action: z.literal('rename'),
  worksheetNumber: z.number(),
  worksheetName: z.string().max(64),
});

const UpdateWorksheetSchema = z.union([
  AddWorksheetSchema,
  DeleteWorksheetSchema,
  RenameWorksheetSchema,
]);

export const updateWorksheet = async (
  req: express.Request,
  res: express.Response,
): Promise<void> => {
  winston.info('Updating worksheets metadata');

  const { netId } = req.user!;

  const bodyParseRes = UpdateWorksheetSchema.safeParse(req.body);
  if (!bodyParseRes.success) {
    res.status(400).json({ error: 'INVALID_REQUEST' });
    return;
  }

  const { action } = bodyParseRes.data;

  if (action === 'add') {
    const { worksheetName } = bodyParseRes.data;

    winston.info(
      `Adding worksheet with name "${worksheetName}" for user ${netId}`,
    );
    await db.insert(worksheets).values({
      netId,
      worksheetName,
    });
  } else if (action === 'delete') {
    const { worksheetNumber } = bodyParseRes.data;
    const [existingWorksheet] = await db
      .select()
      .from(worksheets)
      .where(
        and(
          eq(worksheets.netId, netId),
          eq(worksheets.worksheetNumber, worksheetNumber),
        ),
      );

    if (!existingWorksheet) {
      res.status(400).json({ error: 'WORKSHEET_NOT_FOUND' });
      return;
    }

    winston.info(`Deleting worksheet ${worksheetNumber} for user ${netId}`);
    await db
      .delete(worksheets)
      .where(
        and(
          eq(worksheets.netId, netId),
          eq(worksheets.worksheetNumber, worksheetNumber),
        ),
      );
  } else if (action === 'rename') {
    const { worksheetNumber, worksheetName } = bodyParseRes.data;
    const [existingWorksheet] = await db
      .select()
      .from(worksheets)
      .where(
        and(
          eq(worksheets.netId, netId),
          eq(worksheets.worksheetNumber, worksheetNumber),
        ),
      );

    if (!existingWorksheet) {
      res.status(400).json({ error: 'WORKSHEET_NOT_FOUND' });
      return;
    }
    winston.info(
      `Renaming worksheet ${worksheetNumber} for user ${netId} to "${worksheetName}"`,
    );
    await db
      .update(worksheets)
      .set({ worksheetName })
      .where(
        and(
          eq(worksheets.netId, netId),
          eq(worksheets.worksheetNumber, worksheetNumber),
        ),
      );
    return undefined;
  }

  res.sendStatus(200);
};

export const getUserWorksheetNames = async (
  req: express.Request,
  res: express.Response,
): Promise<void> => {
  winston.info(`Fetching worksheet names for user`);

  const { netId } = req.user!;

  const worksheetNames = await db
    .select({
      worksheetNumber: worksheets.worksheetNumber,
      worksheetName: worksheets.worksheetName,
    })
    .from(worksheets)
    .where(eq(worksheets.netId, netId));

  winston.info(
    `Retrieved ${worksheetNames.length} worksheets for user ${netId}`,
  );

  const worksheetMap = Object.fromEntries(
    worksheetNames.map(({ worksheetNumber, worksheetName }) => [
      worksheetNumber,
      worksheetName,
    ]),
  );

  res.json({
    netId,
    worksheets: worksheetMap,
  });
};
