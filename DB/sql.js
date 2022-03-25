const mysql = require("mysql");
let connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  port:'3306',
  password: "123456",
  database: "marry",
  connectTimeout:5000,
});
module.exports = connection;
