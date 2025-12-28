/// backend/server.js
require("dotenv").config(); // 若本機有用 .env，這行要放最上面

const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();

// 中介層
app.use(cors());
app.use(express.json());

// 1) 健康檢查：確認後端有在跑
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "backend is running" });
});

// 2) 確認後端可以連到 MySQL（SELECT 1）
app.get("/api/ping", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS n");
    res.json({ ok: true, result: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// 3) 讀醫生表 DOCTOR
//   欄位：doc_id, doc_name, specialty
app.get("/api/doctors", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT doc_id, doc_name, specialty FROM DOCTOR ORDER BY doc_id"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// 4) 讀病患表 PATIENT
//   欄位：pat_id, pat_name, phone
app.get("/api/patients", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT pat_id, pat_name, phone FROM PATIENT ORDER BY pat_id"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// 5) 讀掛號表 APPOINTMENT + JOIN 醫生 & 病患
//   欄位：appt_id, doc_id, pat_id, appt_date
app.get("/api/appointments", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        a.appt_id,
        a.appt_date,
        d.doc_id,
        d.doc_name,
        d.specialty,
        p.pat_id,
        p.pat_name,
        p.phone
      FROM APPOINTMENT a
      JOIN DOCTOR d ON a.doc_id = d.doc_id
      JOIN PATIENT p ON a.pat_id = p.pat_id
      ORDER BY a.appt_date, a.appt_id
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// 6) 新增一筆掛號
app.post("/api/appointments", async (req, res) => {
  try {
    const { doc_id, pat_id, appt_date } = req.body;

    if (!doc_id || !pat_id || !appt_date) {
      return res.status(400).json({ ok: false, error: "缺少欄位" });
    }

    await pool.query(
      `INSERT INTO APPOINTMENT (doc_id, pat_id, appt_date)
       VALUES (?, ?, ?)`,
      [doc_id, pat_id, appt_date]
    );

    res.json({ ok: true, message: "掛號新增成功" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ✅ 重點：PORT 要支援雲端給的 process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ API server running on port ${PORT}`);
});