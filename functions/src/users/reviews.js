import { logger } from "firebase-functions";
import { addReviewSnippet } from "./addReviewSnippet.js";

export const createReview = async (event) => {
  logger.info(
    '~~~~~~~~~~~~~~~~~ Received new review with ID:',
    event.params.reviewId,
  )
  
  await addReviewSnippet(event.params.userId);

  logger.info(
    '~~~~~~~~~~~~~~~~~ Finished adding snippet',
    event.params.reviewId,
  )
};
