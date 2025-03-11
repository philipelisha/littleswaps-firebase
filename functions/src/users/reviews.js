import { logger } from "firebase-functions";
import { addReviewSnippet } from "./addReviewSnippet.js";
import admin from '../../adminConfig.js';


export const createReview = async (event) => {
  logger.info("~~~~~~~~~~~~ START createReview ~~~~~~~~~~~~", event);

  const db = admin.firestore();
  const { userId } = event.params;
  const data = event.data.data()
  const { rating } = data;

  await addReviewSnippet(userId);

  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();
  const userData = userDoc.data();

  const newReviews = (userData.reviews || 0) + 1;
  const newRatingSum = (userData.ratingSum || 0) + rating;
  const newAverageRating = newRatingSum / newReviews;

  await userRef.update({
    reviews: newReviews,
    ratingSum: newRatingSum,
    averageRating: newAverageRating
  });
};