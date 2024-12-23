import admin from '../../adminConfig.js';

export const getLikeSnippet = async (product) => {
  const likesQuery = await admin
    .firestore()
    .collection('likes')
    .where('product', '==', product)
    .orderBy('date', 'desc')
    .limit(3)
    .get()

  return likesQuery.docs.map(doc => {
    const like = doc.data();
    return {
      id: `${like.user}_${like.product}`,
      user: like.user,
      username: like.username || '',
    };
  });
};
