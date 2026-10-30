import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    service: "VaultPay API",
  });
});

app.listen(PORT, () => {
  console.log(`VaultPay API running on port ${PORT}`);
});
