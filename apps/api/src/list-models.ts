import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function list() {
  try {
    const list = await groq.models.list();
    console.log("\n📋 Active models for your Groq account:\n");
    list.data.forEach((model) => {
      console.log(` - ${model.id}`);
    });
  } catch (error) {
    console.error("Error listing models:", error);
  }
}

list();