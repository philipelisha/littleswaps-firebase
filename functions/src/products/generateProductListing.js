import { https, logger } from "firebase-functions";
import admin from "../../adminConfig.js";
import axios from "axios";

const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;
const GEMINI_AI_API_KEY = process.env.GEMINI_AI_API_KEY;

const analyzeImage = async (imageUrl) => {
  const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`;
  const requestBody = {
    requests: [
      {
        image: { source: { imageUri: imageUrl } },
        features: [
          { type: "LABEL_DETECTION" },
          { type: "TEXT_DETECTION" },
          { type: "LOGO_DETECTION" },
          { type: "WEB_DETECTION" }
        ]
      }
    ]
  };

  const response = await axios.post(visionUrl, requestBody);

  if (response.status !== 200) {
    throw new https.HttpsError('Google Vision API error', response.statusText)
  }

  logger.info("Google Vision API response:", response.data);
  return response.data.responses[0];
}

const generateListingDetails = async (extractedData) => {
  const prompt = `
    You are an expert copywriter and product listing specialist. Based on the following image analysis data, write highly engaging and market-optimized listing content.

    Return ONLY a valid JSON object — do not include markdown, extra commentary, code blocks, or numbering. Use double quotes for all keys and string values. Format it exactly like the example structure below.
    Example response:
    {
      "title": "Eco-Friendly Stainless Steel Water Bottle",
      "description": "Stay hydrated with this sleek, reusable water bottle. Durable, BPA-free, and perfect for on-the-go.",
      "category": "Home & Kitchen",
      "subcategory": "Drinkware",
      "colors": "silver, black",
      "brand": "Hydro Flask",
      "price": 14.99,
      "condition": "Used - In Good Condition",
      "size": "OS"
    }

    Use the same format. Here's the input data:
    {
      "title": "<A concise, compelling (max 12 words)>",
      "description": "<that highlights key features, benefits, or style in under 250 characters>",
      "category": "<Choose from these main categories: Baby Gear, Bedding and Decor, Clothing, Electronics and Gadgets, Feeding and Nursing, Shoes, Furniture, Gift Sets, Health and Safety, Party Supplies, Personal Care, School and Learning Supplies, Toys. If the item doesn’t clearly belong to one, make up a reasonable category>",
      "subcategory": "<A more specific subcategory under the selected category — feel free to create one that fits if it’s not obvious>"
      "colors": "<Comma-separated list of visible colors MAX 2 from these colors: clear, red, pink, orange, yellow, green, blue, purple, gold, silver, black, gray, white, cream, brown, tan>",
      "brand": "<brand name only — no extra info - Use capitalization as per the brand's style>",
      "price": "<a single suggested resale price number in USD, no $ sign>",
      "condition": "<one of the following types: 'New With Tags', 'Like New', 'Used - In Good Condition', 'Fair - But plenty of life left'>",
      "size": "<if applicable, use the most common size format (e.g., S, M, L, XL, 6, 8, 10, 12) or 'OS' for one-size-fits-all>"
    }

    Make sure the tone is friendly and informative, and the language appeals to a shopper looking for quality and a great deal. Avoid generic or vague descriptions.

    Input: ${JSON.stringify(extractedData)}`;

  const response = await axios.post(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    {
      contents: [
        {
          parts: [
            {
              text: prompt,
            }
          ]
        }
      ]
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_AI_API_KEY,
      }
    }
  );

  if (response.status !== 200) {
    throw new https.HttpsError('Gemini AI API error', response.statusText)
  }

  logger.info("Gemini AI response:", response.data?.candidates[0]?.content?.parts[0]?.text);

  return response.data?.candidates[0]?.content?.parts[0]?.text || null;
}

const parseListingResponse = async (text) => {
  const parsedData = JSON.parse(
    text.replace(/```json\n?/, '').replace(/```$/, '').trim()
  );

  const db = admin.firestore();
  const categoryRef = db.collection('categories').doc(parsedData.category);
  const categoryDoc = await categoryRef.get();

  if (!categoryDoc.exists) {
    parsedData.category = '';
    parsedData.subcategory = '';
    return parsedData;
  }
  
  const categoryData = categoryDoc.data()
  const subcategories = categoryData.subcategories || [];
  const subcategoryMatch = subcategories.some(
    (sub) => sub.toLowerCase() === parsedData.subcategory.toLowerCase()
  );

  if (!subcategoryMatch) {
    parsedData.subcategory = '';
  }

  const sizeMap = categoryData.sizes || {};
  const sizingKey = sizeMap[parsedData.subcategory]
    ? parsedData.subcategory
    : 'default';
  const validSizes = sizeMap[sizingKey] || [];

  if (!validSizes.includes(parsedData.size)) {
    parsedData.size = '';
  }

  return parsedData;
};

export const generateProductListing = async (data, context) => {
  try {
    if (!context.auth) {
      throw new https.HttpsError("unauthenticated", "Authentication required.")
    }
    const { imageUrl } = data;

    if (!imageUrl) return { error: "Image URL required" };

    const visionData = await analyzeImage(imageUrl);
    const listingData = await generateListingDetails(visionData);

    return parseListingResponse(listingData)
  } catch (error) {
    logger.error("Error generating product listing:", error);
    return { error: "Internal Server Error" };
  }
};