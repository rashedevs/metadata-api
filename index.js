const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdf = require("pdf-parse");
const mysql = require("mysql");
const sizeOf = require("image-size");
const moment = require("moment");
const fs = require("fs");
const Tesseract = require("tesseract.js");

const app = express();
const port = 8000;
app.use(cors());

// Configure multer storage for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

// Initialize multer with the configured storage
const upload = multer({ storage: storage });

// Configure MySQL connection
const db = mysql.createConnection({
  host: "sql12.freesqldatabase.com",
  user: "sql12672102",
  password: "NnKdN7HLJb",
  database: "sql12672102",
  port: 3306,
});

// Handle MySQL connection errors
db.on("error", (err) => {
  console.error("Database error:", err);
  if (err.code === "PROTOCOL_CONNECTION_LOST") {
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

// Basic route for testing
app.get("/", (req, res) => {
  res.send("Hello, Welcome to metadata!");
});

// Route to retrieve metadata from MySQL
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

// Validate extracted PDF metadata
function isValidMetadata(author, createdDate, fullText) {
  return (
    author !== undefined && createdDate !== undefined && fullText !== undefined
  );
}

// Route to handle file uploads and extract metadata
app.post("/metadata", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const fileType = req.file.mimetype.includes("image") ? "image" : "pdf";
  let metadata = {};

  try {
    if (fileType === "image") {
      const dimensions = getImageDimensions(req.file?.path);
      metadata.dimensions = dimensions;
      metadata.createdDate = "N/A";

      const {
        data: { text },
      } = await Tesseract.recognize(req.file?.path, "eng");
      const imageMetadata = text ? text : "N/A";

      res.json({
        fileType,
        fileName: req.file.originalname,
        metadata: imageMetadata,
        dimensions: metadata?.dimensions || "N/A",
        createdDate: metadata?.createdDate || "N/A",
        author: metadata?.author || "N/A",
      });
    } else if (fileType === "pdf") {
      const { author, createdDate, fullText } = await extractPdfInfo(
        req.file.buffer || fs.readFileSync(req.file.path)
      );

      if (!isValidMetadata(author, createdDate, fullText)) {
        return res.status(400).json({ error: "Invalid PDF metadata" });
      }

      metadata = {
        author,
        createdDate,
        fullText: fullText || "",
      };

      res.json({
        fileType,
        fileName: req.file.originalname,
        metadata: metadata?.fullText,
        dimensions: metadata?.dimensions || "N/A",
        createdDate: metadata?.createdDate || "N/A",
        author: metadata?.author || "N/A",
      });
    }
  } catch (error) {
    console.error("Error processing request:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // Insert metadata into MySQL
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
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    }
  });
});

// Function to extract image dimensions
function getImageDimensions(imagePath) {
  try {
    const dimensions = sizeOf(fs.readFileSync(imagePath));
    return `${dimensions.width}x${dimensions.height}`;
  } catch (error) {
    console.error("Error extracting image dimensions:", error);
    return "unknown";
  }
}

// Function to extract PDF metadata
async function extractPdfInfo(pdfBuffer) {
  try {
    const data = await pdf(pdfBuffer);
    const author = data.info.Author || "Unknown Author";
    const createdDate = formatPdfCreationDate(data.info.CreationDate);
    const fullText = data.text ? data.text : "";

    return { author, createdDate, fullText };
  } catch (error) {
    console.error(
      "Error extracting author and created date from PDF:",
      error.message
    );
    return {
      author: "Unknown Author",
      createdDate: "Invalid date",
      fullText: "",
    };
  }
}

// Function to format PDF creation date
function formatPdfCreationDate(pdfCreationDate) {
  try {
    // Extract the timestamp part and remove any timezone offset
    const timestamp = pdfCreationDate.match(/\d{14}/)[0];

    // Format the timestamp as YYYYMMDDHHmmss
    const formattedTimestamp = moment(timestamp, "YYYYMMDDHHmmss").format(
      "YYYY-MM-DD HH:mm:ss"
    );

    if (moment(formattedTimestamp).isValid()) {
      return formattedTimestamp;
    } else {
      console.error("Invalid PDF creation date:", pdfCreationDate);
      return "N/A";
    }
  } catch (error) {
    console.error("Error formatting PDF creation date:", error);
    return "N/A";
  }
}

// Start the server
app.listen(port, () => {
  console.log(`Metadata Api is running on port ${port}`);
});
