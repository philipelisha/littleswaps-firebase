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
  await userRef.update({
    reviews: admin.firestore.FieldValue.increment(1),
    ratingSum: admin.firestore.FieldValue.increment(rating)
  });

  const userDoc = await userRef.get();
  const userData = userDoc.data();

  if (userData.reviews > 0) {
    await userRef.update({
      averageRating: userData.ratingSum / userData.reviews
    });
  }
};