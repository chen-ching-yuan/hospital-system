// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const pool = require("./db"); // 你的 db.js

const app = express();

// ---------------- 共用設定 ----------------
app.use(cors());
app.use(express.json());

// 小工具：移除 undefined（避免塞進資料庫）
function cleanObject(obj) {
  const newObj = {};
  for (const key in obj) {
    if (obj[key] !== undefined) newObj[key] = obj[key];
  }
  return newObj;
}

// =====================================================
//  健康檢查 & 測試 API
// =====================================================

// /api/health：確認 server + DB 是否正常
app.get("/api/health", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: true, db: rows[0].ok === 1 });
  } catch (err) {
    console.error("Health check error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// /api/ping：單純回一個 pong
app.get("/api/ping", (req, res) => {
  res.json({ ok: true, message: "pong" });
});

// =====================================================
//  DEPT（科別）
// =====================================================

// 取得全部科別：給「依科別預約」下拉選單/按鈕用
app.get("/api/depts", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM DEPT ORDER BY dept_id");
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("取得科別錯誤：", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =====================================================
//  ROOM（診間）
// =====================================================

app.get("/api/rooms", async (req, res) => {
  try {
    const { dept_id } = req.query;

    let sql = "SELECT * FROM ROOM";
    const params = [];

    if (dept_id) {
      sql += " WHERE dept_id = ?";
      params.push(dept_id);
    }
    sql += " ORDER BY room_id";

    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("取得診間錯誤：", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =====================================================
//  DOCTOR（醫生）
// =====================================================

// GET /api/doctors[?dept_id=DE01]
app.get("/api/doctors", async (req, res) => {
  try {
    const { dept_id } = req.query;

    let sql = "SELECT * FROM DOCTOR";
    const params = [];

    if (dept_id) {
      sql += " WHERE dept_id = ?";
      params.push(dept_id);
    }
    sql += " ORDER BY doc_id";

    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("取得醫生錯誤：", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =====================================================
//  SCHEDULE（排班）
// =====================================================
//
// 支援條件：dept_id, doc_id, doc_name(關鍵字), work_date, shift_name
//
app.get("/api/schedules", async (req, res) => {
  try {
    const { dept_id, doc_id, doc_name, work_date, shift_name } = req.query;

    let sql = `
      SELECT
        s.sch_id,
        s.doc_id,
        s.work_date,
        s.shift_name,
        s.room_id,
        d.doc_name,
        d.doc_rank,
        r.room_name,
        dp.dept_id,
        dp.dept_name
      FROM SCHEDULE s
      JOIN DOCTOR d ON s.doc_id = d.doc_id
      JOIN ROOM r ON s.room_id = r.room_id
      JOIN DEPT dp ON d.dept_id = dp.dept_id
      WHERE 1 = 1
    `;
    const params = [];

    if (dept_id) {
      sql += " AND dp.dept_id = ?";
      params.push(dept_id);
    }
    if (doc_id) {
      sql += " AND s.doc_id = ?";
      params.push(doc_id);
    }
    if (doc_name) {
      sql += " AND d.doc_name LIKE ?";
      params.push(`%${doc_name}%`);
    }
    if (work_date) {
      sql += " AND s.work_date = ?";
      params.push(work_date);
    }
    if (shift_name) {
      sql += " AND s.shift_name = ?";
      params.push(shift_name);
    }

    sql += " ORDER BY s.work_date, s.shift_name, s.sch_id";

    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("取得排班錯誤：", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =====================================================
//  PATIENT（病患基本資料）
// =====================================================

// 新增病患（初診建檔頁）
app.post("/api/patients", async (req, res) => {
  try {
    const body = req.body || {};

    // 1️⃣ 所有欄位必填：pat_id, pat_name, pat_phone, pat_identity, pat_gender, pat_birth
    const requiredFields = [
      "pat_id",
      "pat_name",
      "pat_phone",
      "pat_identity",
      "pat_gender",
      "pat_birth",
    ];

    for (const field of requiredFields) {
      const value = body[field];
      if (value === undefined || String(value).trim() === "") {
        return res
          .status(400)
          .json({ ok: false, error: "所有欄位皆為必填，請完整填寫。" });
      }
    }

    // 2️⃣ 只允許這些欄位進 DB（避免多餘欄位）
    const data = cleanObject({
      pat_id: body.pat_id,
      pat_name: body.pat_name,
      pat_phone: body.pat_phone,
      pat_identity: body.pat_identity,
      pat_gender: body.pat_gender,
      pat_birth: body.pat_birth,
    });

    // 理論上這裡一定不會是空，但保險起見再檢查一次
    if (Object.keys(data).length === 0) {
      return res
        .status(400)
        .json({ ok: false, error: "沒有可寫入的欄位" });
    }

    // 3️⃣ 明確欄位 INSERT
    const cols = Object.keys(data);
    const placeholders = cols.map(() => "?").join(",");
    const values = Object.values(data);

    const sql = `
      INSERT INTO PATIENT (${cols.join(",")})
      VALUES (${placeholders})
    `;

    await pool.execute(sql, values);

    res.json({ ok: true, message: "新增病患成功" });
  } catch (err) {
    console.error("新增病患錯誤：", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 取得下一個病歷號（例如 P001, P002, P003...）
app.get("/api/patients/next-id", async (req, res) => {
  try {
    // 取目前 PATIENT 中最大的 pat_id
    const [rows] = await pool.query(
      "SELECT pat_id FROM PATIENT ORDER BY pat_id DESC LIMIT 1"
    );

    let nextId = "P001";

    if (rows.length > 0 && rows[0].pat_id) {
      const lastId = rows[0].pat_id;
      const match = lastId.match(/^P(\d+)$/); // 例如 P001, P023

      if (match) {
        const num = parseInt(match[1], 10) + 1;
        nextId = "P" + String(num).padStart(3, "0"); // 補成三位數
      } else {
        // 如果目前資料不是 P 開頭的格式，就加個 _1 避免壞掉
        nextId = lastId + "_1";
      }
    }

    res.json({ ok: true, pat_id: nextId });
  } catch (err) {
    console.error("取得下一個病歷號錯誤：", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =====================================================
//  APPOINTMENT（掛號）
// =====================================================
//
// 支援：
//  - POST /api/appointments （簡易模式：doc_id + pat_id + appt_date）
//  - GET /api/appointments （查詢 + 查詢頁使用身份證+生日）
//  - PUT /api/appointments/:appt_id/cancel （取消掛號）
//

// 產生新的 appt_id（簡單版：A + 三位數遞增）
async function generateApptId() {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM APPOINTMENT"
  );
  const next = rows[0].cnt + 1;
  const num = String(next).padStart(3, "0"); // 001, 002, ...
  return `A${num}`;
}

app.post("/api/appointments", async (req, res) => {
  try {
    const body = req.body || {};

    // 情況 A：完整欄位都自己給（進階用）
    if (body.appt_id && body.sch_id && body.pat_id) {
      const data = {
        appt_id: body.appt_id,
        sch_id: body.sch_id,
        pat_id: body.pat_id,
        appt_seq: body.appt_seq || 1,
        status: body.status || "預約",
      };

      const sqlA = `
        INSERT INTO APPOINTMENT (appt_id, sch_id, pat_id, appt_seq, status)
        VALUES (?, ?, ?, ?, ?)
      `;
      const valsA = [
        data.appt_id,
        data.sch_id,
        data.pat_id,
        data.appt_seq,
        data.status,
      ];

      await pool.execute(sqlA, valsA);
      return res.json({ ok: true, message: "建立掛號成功(完整模式)" });
    }

    // 情況 B：沿用你舊版 app.js 的簡單 payload
     // 現在支援兩種方式：
    //  1) 直接給 pat_id
    //  2) 給 pat_identity + pat_birth，由後端幫忙查 pat_id
    const {
      doc_id,
      pat_id: rawPatId,
      appt_date,
      pat_identity,
      pat_birth,
    } = body;

    let pat_id = rawPatId; // 先用原本傳進來的，沒有再用身份證+生日查

    // 檢查必要欄位
    if (!doc_id || !appt_date || (!pat_id && !(pat_identity && pat_birth))) {
      return res.status(400).json({
        ok: false,
        error: "缺少必要欄位：doc_id + (pat_id 或 身分證+生日) + appt_date",
      });
    }

    // 如果沒有 pat_id，但有給身分證＋生日，就去 PATIENT 查 pat_id
    if (!pat_id && pat_identity && pat_birth) {
      const [pRows] = await pool.query(
        "SELECT pat_id FROM PATIENT WHERE pat_identity = ? AND pat_birth = ? LIMIT 1",
        [pat_identity, pat_birth]
      );

      if (pRows.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "找不到對應的病患資料，請先建立基本資料",
        });
      }

      pat_id = pRows[0].pat_id;
    }

    // 1) 找到對應的排班（doc_id + 日期）
    const [schRows] = await pool.query(
      "SELECT sch_id FROM SCHEDULE WHERE doc_id = ? AND work_date = ? ORDER BY shift_name LIMIT 1",
      [doc_id, appt_date]
    );

    if (schRows.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "該醫師在此日期沒有排班，無法掛號",
      });
    }

    const sch_id = schRows[0].sch_id;

    // 2) 決定 appt_seq
    const [seqRows] = await pool.query(
      "SELECT COALESCE(MAX(appt_seq), 0) AS max_seq FROM APPOINTMENT WHERE sch_id = ?",
      [sch_id]
    );
    const appt_seq = seqRows[0].max_seq + 1;

    // 3) 產生 appt_id
    const [countRows] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM APPOINTMENT"
    );
    const next = countRows[0].cnt + 1;
    const num = String(next).padStart(3, "0");
    const appt_id = `A${num}`;

    const sqlB = `
      INSERT INTO APPOINTMENT (appt_id, sch_id, pat_id, appt_seq, status)
      VALUES (?, ?, ?, ?, ?)
    `;
    const valsB = [appt_id, sch_id, pat_id, appt_seq, "預約"];

    await pool.execute(sqlB, valsB);

    res.json({
      ok: true,
      message: "建立掛號成功(簡易模式)",
      data: {
        appt_id,
        sch_id,
        pat_id,
        appt_seq,
        status: "預約",
      },
    });
  } catch (err) {
    console.error("新增掛號錯誤：", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 查詢掛號列表（查詢頁、測試用）
// 支援條件：pat_id, doc_id, dept_id, work_date, pat_identity, pat_birth
app.get("/api/appointments", async (req, res) => {
  try {
    const {
      pat_id,
      doc_id,
      dept_id,
      work_date,
      pat_identity,
      pat_birth,
    } = req.query;

    let sql = `
      SELECT
        a.appt_id,
        a.sch_id,
        a.pat_id,
        a.appt_seq,
        a.status,
        p.pat_name,
        p.pat_identity,
        p.pat_birth,
        s.work_date,
        s.shift_name,
        d.doc_id,
        d.doc_name,
        dp.dept_id,
        dp.dept_name,
        r.room_name
      FROM APPOINTMENT a
      JOIN PATIENT p ON a.pat_id = p.pat_id
      JOIN SCHEDULE s ON a.sch_id = s.sch_id
      JOIN DOCTOR d ON s.doc_id = d.doc_id
      JOIN DEPT dp ON d.dept_id = dp.dept_id
      JOIN ROOM r ON s.room_id = r.room_id
      WHERE 1 = 1
    `;
    const params = [];

    if (pat_id) {
      sql += " AND a.pat_id = ?";
      params.push(pat_id);
    }
    if (doc_id) {
      sql += " AND d.doc_id = ?";
      params.push(doc_id);
    }
    if (dept_id) {
      sql += " AND dp.dept_id = ?";
      params.push(dept_id);
    }
    if (work_date) {
      sql += " AND s.work_date = ?";
      params.push(work_date);
    }
    if (pat_identity) {
      sql += " AND p.pat_identity = ?";
      params.push(pat_identity);
    }
    if (pat_birth) {
      sql += " AND p.pat_birth = ?";
      params.push(pat_birth);
    }

    sql += " ORDER BY s.work_date, s.shift_name, a.appt_seq";

    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("查詢掛號錯誤：", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 取消掛號
app.put("/api/appointments/:appt_id/cancel", async (req, res) => {
  try {
    const apptId = req.params.appt_id;
    const [result] = await pool.execute(
      "UPDATE APPOINTMENT SET status = ? WHERE appt_id = ?",
      ["取消", apptId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: "找不到該筆掛號" });
    }
    res.json({ ok: true, message: "取消掛號成功" });
  } catch (err) {
    console.error("取消掛號錯誤：", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// SQL 測試主控台 API（管理用）
// 允許 SELECT / INSERT / UPDATE / DELETE
// 但禁止 DROP / ALTER / TRUNCATE / CREATE / GRANT / REVOKE 等高風險操作
app.post("/api/sql", async (req, res) => {
  try {
    const { sql } = req.body || {};
    if (!sql || typeof sql !== "string") {
      return res.status(400).json({ ok: false, error: "請提供 SQL 指令字串。" });
    }

    // 正規化字串：去頭尾空白、轉大寫、壓縮空白
    const normalized = sql.trim();
    const upper = normalized.toUpperCase().replace(/\s+/g, " ");

    // 安全防護 1：禁止多語句（避免 ; 中間串很多指令）
    // 允許最後一個分號，例如 "SELECT * FROM PATIENT;"
    const semicolonIndex = upper.indexOf(";");
    if (semicolonIndex !== -1 && semicolonIndex < upper.length - 1) {
      return res.status(400).json({
        ok: false,
        error: "目前僅允許單一 SQL 指令，不支援多語句（多個分號）。",
      });
    }

    // 取開頭關鍵字
    const firstWordMatch = upper.match(/^(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)/);
    const firstWord = firstWordMatch ? firstWordMatch[1] : null;

    if (!firstWord) {
      return res.status(400).json({
        ok: false,
        error: "無法判斷 SQL 指令類型，請確認語法是否正確。",
      });
    }

    // 安全防護 2：禁止高風險語句
    const forbidden = ["DROP", "ALTER", "TRUNCATE", "CREATE", "GRANT", "REVOKE"];
    if (forbidden.includes(firstWord)) {
      return res.status(400).json({
        ok: false,
        error: `為避免破壞資料庫結構，不允許執行 ${firstWord} 指令。`,
      });
    }

    // 允許：SELECT / INSERT / UPDATE / DELETE
    const [rows, fields] = await pool.query(sql);

    // 對於 SELECT，rows 會是陣列；對於 INSERT/UPDATE/DELETE，rows 會是一個 ResultSetHeader 物件
    if (Array.isArray(rows)) {
      // 查詢類結果
      return res.json({
        ok: true,
        type: "SELECT",
        rows,
        fields: fields ? fields.map(f => f.name) : [],
      });
    } else {
      // 寫入 / 更新 / 刪除 類結果
      const info = rows || {};
      return res.json({
        ok: true,
        type: firstWord,          // "INSERT" / "UPDATE" / "DELETE"
        rows: [],                 // 前端看到不是陣列就不會畫表格，只看 jsonOutput
        affectedRows: info.affectedRows,
        changedRows: info.changedRows,
        insertId: info.insertId,
      });
    }
  } catch (err) {
    console.error("SQL console error:", err);
    res.status(500).json({
      ok: false,
      error: err.message || "伺服器錯誤",
    });
  }
});

// =====================================================
//  啟動 Server
// =====================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server 已啟動：http://localhost:${PORT}`);
});
