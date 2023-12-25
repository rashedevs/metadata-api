const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdf = require("pdf-parse");
const mysql = require("mysql");
const sizeOf = require("image-size");
const moment = require("moment");

const app = express();
const port = 8000;
app.use(cors());
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const db = mysql.createConnection({
  host: "sql12.freesqldatabase.com",
  user: "sql12672102",
  password: "NnKdN7HLJb",
  database: "sql12672102",
  port: 3306,
});

db.on("error", (err) => {
  console.error("Database error:", err);
  if (err.code === "PROTOCOL_CONNECTION_LOST") {
    // Reconnect to the database
    db.getConnection((connectionErr, connection) => {
      if (connectionErr) {
        console.error("Error reconnecting to the database:", connectionErr);
      } else {
        console.log("Reconnected to the database");
        connection.release();
      }
    });
  } else {
    throw err;
  }
});

app.get("/", (req, res) => {
  res.send("Hello, Welcome to metadata!");
});

app.get("/metadata", (req, res) => {
  const sql = "SELECT * FROM metadata";

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error retrieving metadata from MySQL:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    res.json(results);
  });
});

app.post("/metadata", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const fileType = req.file.mimetype.includes("image") ? "image" : "pdf";
  let metadata = {};

  if (fileType === "image") {
    // Extract image dimensions
    const dimensions = getImageDimensions(req.file.buffer);
    metadata.dimensions = dimensions;
    metadata.createdDate = "N/A";
  } else if (fileType === "pdf") {
    try {
      // Extract author and created date from PDF
      const { author, createdDate } = await extractPdfInfo(req.file.buffer);
      metadata.author = author;
      metadata.createdDate = createdDate;
      metadata.fullText = fullText;
    } catch (error) {
      console.error("Error extracting PDF metadata:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  const sql =
    "INSERT INTO metadata (fileType, fileName, dimensions, metadata, author, createdDate) VALUES (?, ?, ?, ?, ?, ?)";
  const values = [
    fileType,
    req.file.originalname,
    metadata.dimensions || "N/A",
    JSON.stringify(metadata),
    metadata.author || "N/A",
    metadata.createdDate || "N/A",
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error inserting metadata into MySQL:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    console.log("Metadata inserted into MySQL:", result);

    res.json({
      fileType,
      fileName: req.file.originalname,
      metadata: metadata?.fullText,
      dimensions: metadata?.dimensions || "N/A",
      createdDate: metadata?.createdDate || "N/A",
      author: metadata?.author || "N/A",
    });
  });
});

// Function to extract image dimensions
function getImageDimensions(imageBuffer) {
  try {
    const dimensions = sizeOf(imageBuffer);
    return `${dimensions.width}x${dimensions.height}`;
  } catch (error) {
    console.error("Error extracting image dimensions:", error);
    return "unknown";
  }
}

// Function to extract author and created date from PDF
async function extractPdfInfo(pdfBuffer) {
  try {
    const data = await pdf(pdfBuffer);
    const author = data.info.Author || "Unknown Author";
    const createdDate = formatPdfCreationDate(data.info.CreationDate);
    return { author, createdDate };
  } catch (error) {
    console.error("Error extracting author and created date from PDF:", error);
    return { author: "Unknown Author", createdDate: "Invalid date" };
  }
}

// Function to format PDF creation date
function formatPdfCreationDate(pdfCreationDate) {
  const momentDate = moment(pdfCreationDate, "ddd MMM DD HH:mm:ss YYYY", "en");
  if (momentDate.isValid()) {
    return momentDate.format("YYYY-MM-DD HH:mm:ss");
  } else {
    console.error("Invalid PDF creation date:", pdfCreationDate);
    return "N/A";
  }
}

app.listen(port, () => {
  console.log(`Metadata is running on port ${port}`);
});
