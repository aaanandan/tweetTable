const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { OAuth2Client } = require("google-auth-library");
const credentials = require("./creds.json"); // Replace with your service account JSON file path
const moment = require("moment");
require("dotenv").config(); // Load environment variables from .env file
const bodyParser = require("body-parser");
const axios = require("axios"); // For making API calls
const app = express();
const port = 3000;
app.use(bodyParser.urlencoded({ extended: true }));

// Set up Multer to handle file uploads
const upload = multer({ dest: "uploads/" });

// Google Sheets API setup
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// Serve static files (HTML and JS)
app.use(express.static("public"));

// Route to handle file upload
app.post("/upload", upload.single("file"), async (req, res) => {
  const inputFile = req.file.path;

  try {
    const tweetData = await processTweets(inputFile);
    const sheetId = "1vP5u0XYnbI5tcAIkmrr3PG4MeZ5bl-xdIIp-S62tD7Y"; // Your Google Sheets ID
    await updateGoogleSheet(tweetData, sheetId);
    res
      .status(200)
      .json({ success: true, message: "File processed successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Function to process the uploaded file and extract tweets
function processTweets(inputFile) {
  return new Promise((resolve, reject) => {
    fs.readFile(inputFile, "utf8", (err, data) => {
      if (err) {
        reject(new Error("Error reading file"));
        return;
      }

      const tweetBlocks = data.split(/\n\s*\d+\.\s+/).filter(Boolean);
      let tweets = [];
      let digimahantName = "";

      tweetBlocks.forEach((block, index) => {
        const parts = block.split("Response:");
        if (parts.length === 2) {
          let tweetDetails = parts[0].trim();
          const tweetResponse = parts[1].trim().replace(/^"(.*)"$/, "$1");

          if (index === 0) {
            const headerMatch = tweetDetails.match(
              /Here are the tweets for (.*?):/
            );
            if (headerMatch) {
              digimahantName = headerMatch[1];
              tweetDetails = tweetDetails.replace(
                /Here are the tweets for .*?:\s*/,
                ""
              );
            }
          }

          tweets.push({
            "Tweet#": index + 1,
            "Tweet Details": tweetDetails,
            "Tweet Response": tweetResponse,
            "Digimahant name":
              digimahantName || "Bhagavān Nithyananda Paramashivam",
          });
        }
      });

      resolve(tweets);
    });
  });
}

// Function to update Google Sheet
async function updateGoogleSheet(tweets, spreadsheetId) {
  const sheetName = `Tweet+${moment().format("YYYY-MM-DD")}`;
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName,
              },
            },
          },
        ],
      },
    });

    const values = [
      ["Tweet#", "Tweet Details", "Tweet Response", "Digimahant name"],
      ...tweets.map((tweet) => [
        tweet["Tweet#"],
        tweet["Tweet Details"],
        tweet["Tweet Response"],
        tweet["Digimahant name"],
      ]),
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: values,
      },
    });
  } catch (error) {
    throw new Error("Error updating Google Sheets");
  }
}
// Get variables from .env
const GPT_API_KEY = process.env.GPT_API_KEY;
const GPT_API_URL = "https://api.openai.com/v1/completions"; // Replace with your GPT endpoint
const DEFAULT_PROMPT =
  process.env.PROMPT ||
  "Please generate 108 spritual tweets using the contest content provided";

if (!GPT_API_KEY || !GPT_API_URL) {
  console.error("Error: GPT_API_KEY and GPT_API_URL must be set in .env");
  process.exit(1);
}

// API Endpoint to handle tweet generation
app.post("/generate-tweets", async (req, res) => {
  const { content } = req.body;
  const prompt = content || DEFAULT_PROMPT;

  try {
    // Call GPT API
    const response = await axios.post(
      GPT_API_URL,
      {
        model: "text-davinci-003",
        prompt: `${prompt}\nGenerate 108 tweets in the format:\n1. <Tweet>\nResponse: "<Response>"`,
        max_tokens: 2000,
        n: 1,
        stop: null,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GPT_API_KEY}`,
        },
      }
    );

    const tweets = response.data.choices[0].text.trim();

    // Save the tweets to a file
    const filePath = path.join(__dirname, "tweets.txt");
    fs.writeFileSync(filePath, tweets, "utf8");

    // Return the file for download
    res.download(filePath, "tweets.txt", (err) => {
      if (err) {
        console.error("Error during file download:", err);
        res.status(500).send("Error generating the file");
      }

      // Optionally, delete the file after download
      fs.unlink(filePath, (err) => {
        if (err) console.error("Error deleting file:", err);
      });
    });
  } catch (error) {
    console.error("Error generating tweets:", error.message);
    res.status(500).send("Error generating tweets");
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
