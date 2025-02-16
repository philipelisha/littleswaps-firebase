import { logger } from "firebase-functions";
import { addReviewSnippet } from "./addReviewSnippet.js";

export const createReview = async (event) => {
  logger.info("~~~~~~~~~~~~ START createReview ~~~~~~~~~~~~", event);
  
  await addReviewSnippet(event.params.userId);
};
