import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { FaPlus, FaMinus } from 'react-icons/fa';
import { MdErrorOutline } from 'react-icons/md';
import { Button, Tooltip, OverlayTrigger, Fade } from 'react-bootstrap';
import clsx from 'clsx';

import { useUser } from '../../contexts/userContext';
import { worksheetColors } from '../../utilities/constants';
import type { Listing } from '../../utilities/common';
import { isInWorksheet, checkConflict } from '../../utilities/course';
import { toggleBookmark } from '../../utilities/api';
import { useWindowDimensions } from '../../contexts/windowDimensionsContext';
import { useWorksheet } from '../../contexts/worksheetContext';
import { useWorksheetInfo } from '../../contexts/ferryContext';
import styles from './WorksheetToggleButton.module.css';
import { CUR_YEAR } from '../../config';

/**
 * Displays icon when there is a course conflict with worksheet
 * @prop course - holds listing info
 */
function CourseConflictIcon({
  listing,
  inWorksheet,
  modal,
  worksheetNumber,
}: {
  readonly listing: Listing;
  readonly inWorksheet: boolean;
  readonly modal: boolean;
  readonly worksheetNumber: number;
}) {
  const { user } = useUser();

  // Fetch listing info for each listing in user's worksheet
  const { data } = useWorksheetInfo(
    user.worksheets,
    listing.season_code,
    worksheetNumber,
  );

  const warning = useMemo(() => {
    // If the course is in the worksheet, we never report a conflict
    if (inWorksheet) return undefined;
    if (modal) {
      if (!CUR_YEAR.includes(listing.season_code))
        return 'This will add to a worksheet of a semester that has already ended.';
      return undefined;
    }
    if (listing.times_summary === 'TBA') return undefined;
    const conflicts = checkConflict(data, listing);
    if (conflicts.length > 0)
      return `Conflicts with: ${conflicts.map((x) => x.course_code).join(', ')}`;
    return undefined;
  }, [inWorksheet, modal, listing, data]);

  return (
    <Fade in={Boolean(warning)}>
      <div
        className={
          modal ? styles.courseConflictIconModal : styles.courseConflictIcon
        }
      >
        {warning && (
          <OverlayTrigger
            placement="top"
            overlay={(props) => (
              <Tooltip {...props} id="conflict-icon-button-tooltip">
                <small style={{ fontWeight: 500 }}>{warning}</small>
              </Tooltip>
            )}
          >
            <MdErrorOutline color="#fc4103" />
          </OverlayTrigger>
        )}
      </div>
    </Fade>
  );
}

function WorksheetToggleButton({
  listing,
  modal,
  inWorksheet: inWorksheetProp,
}: {
  readonly listing: Listing;
  readonly modal: boolean;
  readonly inWorksheet?: boolean;
}) {
  // Fetch user context data and refresh function
  const { user, userRefresh } = useUser();

  const {
    curSeason,
    hiddenCourses,
    toggleCourse,
    worksheetNumber,
    worksheetOptions,
  } = useWorksheet();

  // In the modal, the select can override the "currently viewed" worksheet
  const [selectedWorksheet, setSelectedWorksheet] = useState(worksheetNumber);
  useEffect(() => {
    setSelectedWorksheet(worksheetNumber);
  }, [worksheetNumber]);

  const inWorksheet = useMemo(
    () =>
      inWorksheetProp ??
      isInWorksheet(
        listing.season_code,
        listing.crn,
        selectedWorksheet,
        user.worksheets,
      ),
    [
      inWorksheetProp,
      listing.season_code,
      listing.crn,
      selectedWorksheet,
      user.worksheets,
    ],
  );

  // Fetch width of window
  const { isLgDesktop } = useWindowDimensions();

  // Handle button click
  const toggleWorkSheet = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();

      // Determine if we are adding or removing the course
      const addRemove = inWorksheet ? 'remove' : 'add';

      // Remove it from hidden courses before removing from worksheet
      if (inWorksheet && hiddenCourses[curSeason]?.[listing.crn])
        toggleCourse(listing.crn);
      const success = await toggleBookmark({
        action: addRemove,
        season: listing.season_code,
        crn: listing.crn,
        worksheetNumber: selectedWorksheet,
        color:
          worksheetColors[Math.floor(Math.random() * worksheetColors.length)]!,
      });
      if (success) await userRefresh();
    },
    [
      inWorksheet,
      hiddenCourses,
      curSeason,
      listing.crn,
      listing.season_code,
      toggleCourse,
      selectedWorksheet,
      userRefresh,
    ],
  );

  return (
    <div className={styles.container}>
      <CourseConflictIcon
        listing={listing}
        inWorksheet={inWorksheet}
        modal={modal}
        worksheetNumber={selectedWorksheet}
      />
      <OverlayTrigger
        placement="top"
        delay={modal ? { show: 300, hide: 0 } : undefined}
        overlay={(props) => (
          <Tooltip id="button-tooltip" {...props}>
            <small>
              {inWorksheet ? 'Remove from' : 'Add to'} my{' '}
              {worksheetOptions[selectedWorksheet]!.label}
            </small>
          </Tooltip>
        )}
      >
        <Button
          variant="toggle"
          className={clsx(
            'py-auto px-1 d-flex align-items-center',
            styles.toggleButton,
          )}
          onClick={toggleWorkSheet}
        >
          {/* Show bookmark icon on modal and +/- everywhere else */}
          {modal ? (
            <>
              {inWorksheet ? (
                <FaMinus size={20} className={styles.scaleIcon} />
              ) : (
                <FaPlus size={20} className={styles.scaleIcon} />
              )}
              {/* Render the worksheet dropdown */}
              <select
                value={selectedWorksheet}
                onChange={(event) => {
                  setSelectedWorksheet(Number(event.target.value));
                }}
                onClick={(e) => {
                  // Check if the clicked target is the select element
                  if ((e.target as HTMLSelectElement).tagName === 'SELECT')
                    e.stopPropagation();
                }}
                // eslint-disable-next-line jsx-a11y/mouse-events-have-key-events
                onMouseEnter={(e) => {
                  e.preventDefault();
                }}
                className={styles.worksheetDropdown}
              >
                {worksheetOptions.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              {inWorksheet ? (
                <FaMinus size={isLgDesktop ? 16 : 14} />
              ) : (
                <FaPlus size={isLgDesktop ? 16 : 14} />
              )}
            </>
          )}
        </Button>
      </OverlayTrigger>
    </div>
  );
}

export default WorksheetToggleButton;
