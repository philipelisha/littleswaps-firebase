import admin from '../../adminConfig.js';
import { getReviewSnippet } from './getReviewSnippet.js';

export const addReviewSnippet = async (userId) => {
  const reviewSnippet = await getReviewSnippet(userId);
  
  await admin
    .firestore()
    .collection('users')
    .doc(userId)
    .update({ reviewSnippet });
}