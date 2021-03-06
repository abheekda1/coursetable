import mysql from 'mysql';
import mysql_db from './mysql_db.js';

const Student = function (student) {};

Student.findOrCreate = (netid) => {
  mysql_db.getConnection(function (err, connection) {
    if (err) {
      console.error(err);
      return;
    }
    connection.query(
      `SELECT * FROM StudentBluebookSettings WHERE netid=${mysql.escape(
        netid
      )}`,
      (err, res) => {
        connection.release(); //put connection back in pool
        if (err) {
          console.error('findOrCreate find error: ', err);
          return;
        }

        // create default user if not exists
        if (res.length === 0) {
          connection.query(
            `INSERT INTO StudentBluebookSettings (netId, shareCoursesEnabled, facebookLastUpdated, noticeLastSeen, timesNoticeSeen, evaluationsEnabled) VALUES (${mysql.escape(
              netid
            )}, 0, 0, 0, 0, 0)`,
            (err, res) => {
              if (err) {
                console.error('findOrCreate create error: ', err);
                return;
              }

              return res;
            }
          );
        }

        return res[0];
      }
    );
  });
};

/**
 * Get the challenge attempt count and whether or not
 * evaluations are enabled for a user.
 *
 * Note that an error is raised if evaluations are enabled.
 *
 * @prop netid - student's netID
 * @prop result - return object
 *
 * @return {response_code, error_message, response_data}
 */
Student.getChallengeStatus = (netid, result) => {
  mysql_db.getConnection(function (err, connection) {
    if (err) {
      console.error(err);
      result(500, err, null);
      return;
    }
    connection.query(
      `SELECT evaluationsEnabled FROM StudentBluebookSettings WHERE netid=${mysql.escape(
        netid
      )}`,
      (err, res) => {
        connection.release(); //put connection back in pool
        if (err) {
          console.error('findChallenge error: ', err);
          result(500, err, null);
          return;
        }

        // affirm single user retrieved
        if (res.length !== 1) {
          result(401, 'USER_NOT_FOUND', null);
          return;
        }

        const evaluationsEnabled = res[0]['evaluationsEnabled'];

        // check if already enabled
        if (evaluationsEnabled === 1) {
          result(403, 'ALREADY_ENABLED', null);
          return;
        }

        result(200, null, res[0]);
      }
    );
  });
};

/**
 * Get the challenge attempt count and whether or not
 * evaluations are enabled for a user.
 *
 * Note that an error is raised if evaluations are enabled.
 *
 * @prop netid - student's netID
 * @prop result - return object
 *
 * @return {response_code, error_message, response_data}
 */
Student.getEvalsStatus = (netid) => {
  mysql_db.getConnection(function (err, connection) {
    if (err) {
      console.error(err);

      return;
    }
    connection.query(
      `SELECT evaluationsEnabled FROM StudentBluebookSettings WHERE netid=${mysql.escape(
        netid
      )}`,
      (err, res) => {
        connection.release(); //put connection back in pool
        if (err) {
          console.error('findChallenge error: ', err);
          return;
        }

        // affirm single user retrieved
        if (res.length !== 1) {
          return;
        }

        const evaluationsEnabled = res[0]['evaluationsEnabled'];

        // check if already enabled
        if (evaluationsEnabled === 1) {
          return true;
        }

        return false;
      }
    );
  });
};

/**
 * Enable evaluations access for a user.
 *
 * @prop netid - student's netID
 * @prop result - return object
 *
 * @return {response_code, error_message, success_boolean}
 */
Student.enableEvaluations = (netid, result) => {
  mysql_db.getConnection(function (err, connection) {
    if (err) {
      console.error(err);
      result(500, err, null);
      return;
    }
    connection.query(
      `UPDATE StudentBluebookSettings SET evaluationsEnabled=1 WHERE netid=${mysql.escape(
        netid
      )}`,
      (err, res) => {
        connection.release(); //put connection back in pool
        if (err) {
          console.error('enableEvaluations error: ', err);
          result(500, err, null);
          return;
        }

        result(200, null, true);
      }
    );
  });
};

export default Student;
