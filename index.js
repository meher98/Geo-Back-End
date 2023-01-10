const express = require("express");
const bodyParser = require("body-parser");
const pgp = require("pg-promise")();
const cors = require("cors");
const fileUpload = require("express-fileupload");

const app = express();
const port = 1998;
app.use(fileUpload());
app.use(cors());
app.use(bodyParser.json());

const db = pgp({
  database: "meher",
  port: 5432,
  user: "meher", // any admin user
  password: "1028",
});

const alterTableQueryFunc = (newS, oldS) => {
  let ch = "";

  for (let i = 0; i < newS.columns.length; i++) {
    if (newS.columns[i] === null && oldS.columns[i] !== null) {
      ch += `ALTER TABLE ${oldS.tableName} DROP COLUMN ${oldS.columns[i]?.column}; `;
    } else {
      if (newS.columns[i] !== undefined && oldS.columns[i] === undefined) {
        ch += `ALTER TABLE ${oldS.tableName} ADD COLUMN ${
          newS.columns[i].column
        } ${newS.columns[i].type} ${newS.columns[i].pk ? "PRIMARY KEY" : ""}; `;
      } else {
        if (oldS.columns[i].column !== newS.columns[i].column) {
          ch += `ALTER TABLE ${oldS.tableName} RENAME COLUMN ${oldS.columns[i]?.column} TO ${newS.columns[i].column}; `;
        }
        if (oldS.columns[i].type !== newS.columns[i].type) {
          ch += `ALTER TABLE ${oldS.tableName} ALTER COLUMN ${newS.columns[i]?.column} TYPE ${newS.columns[i].type}; `;
        }
      }
    }
  }
  if (oldS.tableName !== newS.tableName) {
    ch += `ALTER TABLE ${oldS.tableName} RENAME TO ${newS.tableName}; `;
  }
  ch = ch.slice(0, -2);
  return ch;
};

app.post("/add_table", (req, res) => {
  const data = req.body;
  db.any(
    `CREATE TABLE IF NOT EXISTS ${data.tableName}
    (${data.columns.map(
      (e) => `${e.column} ${e.type} ${e.pk ? "PRIMARY KEY" : ""}`
    )});`
  )
    .then((data) => {
      res.status(200).send(data);
    })
    .catch((error) => {
      console.log("ERROR:", error);
      res.status(400).send(error.message);
    });
});

app.patch("/alter_table", (req, res) => {
  const oldS = req.body.oldS;
  const newS = req.body.newS;
  db.any(alterTableQueryFunc(newS, oldS))
    .then((data) => {
      res.status(200).send(data);
    })
    .catch((error) => {
      console.dir(error);
      res.status(400).send(error.message);
    });
});

app.post("/delete_table", (req, res) => {
  const tab = req.body.tab;
  db.any(`DROP TABLE IF EXISTS ${tab}`)
    .then((data) => {
      res.status(200).send(data);
    })
    .catch((error) => {
      console.log("ERROR:", error);
      res.status(400).send(error.message);
    });
});

app.get("/all_tables", (req, res) => {
  db.any(
    "SELECT * FROM information_schema.tables where table_schema NOT IN ('pg_catalog', 'information_schema');"
  )
    .then((data) => {
      res.status(200).send(data);
    })
    .catch((error) => {
      console.log("ERROR:", error);
      res.status(400).send(error.message);
    });
});

app.get("/get_tab/:tab", (req, res) => {
  const tab = req.params.tab;
  db.any(`SELECT * FROM ${tab};`)
    .then((data) => {
      db.any(
        `SELECT isc.*, constraint_name FROM information_schema.columns isc LEFT JOIN information_schema.key_column_usage kcu ON kcu.column_name = isc.column_name where isc.table_name = '${tab}';`
      )
        .then((struc) => {
          res.status(200).send({ data: data, struc: struc });
        })
        .catch((error) => {
          console.log("ERROR:", error);
          res.status(400).send(error.message);
        });
    })
    .catch((error) => {
      console.log("ERROR:", error);
      res.status(400).send(error.message);
    });
});

app.post("/insert", (req, res) => {
  const { tab, data } = req.body;
  db.any(
    `INSERT INTO ${tab} (${Object.keys(data)}) VALUES (${Object.values(
      data
    ).map((el) =>
      el === "true" ? true : el === "false" ? false : `'${el}'`
    )});`
  )
    .then((retour) => {
      res.status(200).send(retour);
    })
    .catch((error) => {
      console.log("ERROR:", error);
      res.status(400).send(error.message);
    });
});

app.patch("/update", (req, res) => {
  const { tab, oldL, newL, condition } = req.body;
  db.any(
    `UPDATE ${tab}
    SET ${Object.keys(newL)
      .map((key) => (newL[key] !== oldL[key] ? `${key} = '${newL[key]}'` : ""))
      .filter((el) => el !== "")}
    WHERE ${condition.map((key) => `${key} = '${oldL[key]}'`).join(" and ")};`
  )
    .then((retour) => {
      res.status(200).send(retour);
    })
    .catch((error) => {
      console.log("ERROR:", error);
      res.status(400).send(error.message);
    });
});

app.post("/delete", (req, res) => {
  const { tab, oldL, condition } = req.body;
  db.any(
    `DELETE FROM ${tab}
    WHERE ${condition.map((key) => `${key} = '${oldL[key]}'`).join(" and ")};`
  )
    .then((retour) => {
      res.status(200).send(retour);
    })
    .catch((error) => {
      console.log("ERROR:", error);
      res.status(400).send(error.message);
    });
});

app.post("/copy_file", (req, res) => {
  const file = req.files.file;
  const tab = req.body.tab;
  if (!file) {
    return res.sendStatus(400);
  }
  const path = __dirname + "/upload/" + file.name;
  file.mv(path);
  db.any(`COPY ${tab} FROM '${path}' DELIMITER ',' CSV HEADER;`)
    .then((retour) => {
      res.status(200).send(retour);
    })
    .catch((error) => {
      console.log("ERROR:", error);
      res.status(400).send(error.message);
    });
});

app.post("/custom_req", (req, res) => {
  const { request } = req.body;
  db.any(request)
    .then((retour) => {
      res.status(200).send(retour);
    })
    .catch((error) => {
      console.log("ERROR:", error);
      res.status(400).send(error.message);
    });
});

app.listen(port, () => console.log(`Server listing to port ${port}`));
