require("colors");

const sqlite3 = require("sqlite3");
const Walker  = require("walk");
const FS      = require("fs");
const Path    = require("path");


let insertedResources = 0;
let checkedReferences = 0;


function forEachFile(options, cb) {
    options = Object.assign({
        dir        : ".",
        filter     : null,
        followLinks: false,
        limit      : 0
    }, options);

    return new Promise((resolve, reject) => {
        const walker = Walker.walk(options.dir, {
            followLinks: options.followLinks
        });

        let i = 0;

        walker.on("errors", (root, nodeStatsArray, next) => {
            reject(
                new Error("Error: " + nodeStatsArray.error + root + " - ")
            );
            next();
        });

        walker.on("end", () => resolve() );

        walker.on("file", (root, fileStats, next) => {
            let path = Path.resolve(root, fileStats.name);
            if (options.filter && !options.filter(path)) {
                return next();
            }
            if (options.limit && ++i > options.limit) {
                return next();
            }
            cb(path, fileStats, next);
        });
    });
}

/**
 * Promisified version of readFile
 * @param {String} path 
 * @param {Object} options 
 */
async function readFile(path, options = null) {
    return new Promise((resolve, reject) => {
        FS.readFile(path, options, (error, result) => {
            if (error) {
                return reject(error);
            }
            resolve(result);
        });
    });
}

/**
 * Parses the given json string into a JSON object. Internally it uses the
 * JSON.parse() method but adds three things to it:
 * 1. Returns a promise
 * 2. Ensures async result
 * 3. Catches errors and rejects the promise
 * @param {String} json The JSON input string
 * @return {Promise<Object>} Promises an object
 * @todo Investigate if we can drop the try/catch block and rely on the built-in
 *       error catching.
 */
async function parseJSON(json)
{
    return new Promise((resolve, reject) => {
        setImmediate(() => {
            let out;
            try {
                out = JSON.parse(json);
            }
            catch (error) {
                return reject(error);
            }
            resolve(out);
        });
    });
}

function parseNDJSON(ndjson, callback) {
    return new Promise(resolve => {
        let lines  = ndjson.trim().split(/\n/);
        let length = lines.length;
        function tick() {
            if (length--)
                callback(lines.shift(), tick);
            else
                resolve();
        }
        tick();
    });
}

// Create DB
function createDatabase(location) {
    

    const DB = new sqlite3.Database(location);

    /**
     * Calls database methods and returns a promise
     * @param {String} method
     * @param {[*]} args 
     */
    DB.promise = (...args) => {
        let [method, ...params] = args;
        return new Promise((resolve, reject) => {
            DB[method](...params, (error, result) => {
                if (error) {
                    return reject(error);
                }
                resolve(result);
            });
        });
    };

    return Promise.resolve()
        .then(() => DB.promise(
            "run",
            `DROP TABLE IF EXISTS "data"`
        ))
        .then(() => DB.promise(
            "run",
            `CREATE TABLE "data"(
                "fhir_type"     Text,
                "resource_id"   Text PRIMARY KEY,
                "resource_json" Text
            );`
        ))
        .then(() => DB);
}

function insertResourceIntoDB(line, DB) {
    return parseJSON(line)
        .then(json => DB.promise(
            "run",
            `INSERT INTO "data"("resource_id", "fhir_type", "resource_json")
            VALUES (?, ?, ?)`,
            json.id, json.resourceType, line
        ))
        .then(() => {
            insertedResources += 1
        })
        .catch(e => {
            console.log("==========================")
            console.log(line)
            console.log(e)
            console.log("==========================")
            throw e
        });
}

function checkReferences(db) {

    const params = {
        $limit : 100,
        $offset: 0
    };

    function prepare() {
        return new Promise((resolve, reject) => {
            const statement = db.prepare(
                `SELECT * FROM "data" LIMIT $limit OFFSET $offset`,
                params,
                prepareError => {
                    if (prepareError) {
                        return reject(prepareError);
                    }
                    resolve(statement);
                }
            );
        });
    }

    function getRows(statement) {
        return new Promise((resolve, reject) => {
            statement.all(params, (err, rows) => {
                if (err) {
                    return reject(err);
                }
                resolve(rows);
            });
        });
    }

    function checkRow(row) {
        let job = Promise.resolve();
        row.resource_json.replace(
            /"reference":"(.*?)\/(.*?)"/gi,
            function(_, resourceType, resourceId) {
                job = job.then(() => DB.promise(
                    "get",
                    `SELECT * FROM "data" WHERE "fhir_type" = ? AND resource_id = ?`,
                    resourceType,
                    resourceId
                ))
                .then(result => {
                    if (!result) {
                        throw new Error(
                            `Unresolved reference from ${row.fhir_type}/${
                            row.resource_id} to ${resourceType}/${resourceId}`
                        )
                    }
                    checkedReferences += 1;
                })
            }
        )
        return job
    }

    function checkRowSet(statement) {
        return getRows(statement).then(rowSet => {
            process.stdout.write("\033[2KChecking rows " + params.$offset + " to " + (params.$offset + params.$limit) + "...\r");
            if (rowSet.length) {
                return Promise.all(rowSet.map(checkRow)).then(() => {
                    params.$offset += rowSet.length;
                    return checkRowSet(statement);
                });
            }
        });
    }

    return prepare().then(statement => checkRowSet(statement));
}

// run =========================================================================
let DB;
createDatabase("./database.db")
.then(db => {
    DB = db
    return new Promise((resolve, reject) => {
        const job = forEachFile({
            dir   : "./downloads",
            filter: path => path.endsWith(".ndjson"),
        }, (path, fileStats, next) => {
            readFile(path, "utf8").then(lines => {
                console.log(`Inserting resources from ${fileStats.name}...`);
                return Promise.all(lines.trim().split(/\n/).map(line => {
                    return insertResourceIntoDB(line, DB);
                }));
            }).then(next);
        })
        
        resolve(job);
    });
})
.then(() => checkReferences(DB))
.then(() => {
    console.log("\nValidation complete".green)
    console.log(`${insertedResources} resources inserted in DB`);
    console.log(`${checkedReferences} references checked\n`);
})
.catch(e => console.error((e.message || String(e)).red));

