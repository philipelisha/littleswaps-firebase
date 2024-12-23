import admin from '../../adminConfig.js';

export const getReviewSnippet = async (userId) => {
  const reviewsQuery = await admin
    .firestore()
    .collection('users')
    .doc(userId)
    .collection('reviews')
    .orderBy('date', 'desc')
    .limit(3)
    .get();

  return reviewsQuery.docs.map(doc => doc.data());
};
