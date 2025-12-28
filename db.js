// // backend/db.js
// const mysql = require("mysql2/promise");

// // ✅ 這裡改成「你現在用來連遠端 MySQL 的那組設定」
// //   host / user / password / database / port
// //   基本上就跟你在 MySQL Workbench 或 CLI 用的一樣
// const pool = mysql.createPool({
//   host: "b5yypeztzmwusrlbzhnv-mysql.services.clever-cloud.com",      // 例如：db.xxx.com 或 IP
//   user: "uqtv1ugicoi1p5fz",
//   password: "QIx6mLvVGXCRJnr7jcFX",
//   database: "b5yypeztzmwusrlbzhnv",    // 裡面有 DOCTOR / PATIENT / APPOINTMENT
//   port: 3306,                   // 若對方有改 port，就改成對方給的
//   waitForConnections: true,
//   connectionLimit: 10,
// });

// module.exports = pool;

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;