import admin from "../../adminConfig.js";
import { logger } from "firebase-functions";

export const updateProductSnippet = async (userId) => {
  try {
    const db = admin.firestore();

    const productsQuery = await db
      .collection('products')
      .where('active', '==', true)
      .where('user', '==', userId)
      .orderBy('updated', 'desc')
      .limit(10)
      .get();

    const filteredProducts = productsQuery.docs
      .filter((doc) => !doc.data().purchaseDate)
      .slice(0, 3);

    await db
      .collection('users')
      .doc(userId)
      .update({
        productSnippet: filteredProducts.map((doc) => ({
          id: doc.id,
          mainImage: doc.data().mainImage || null,
        })),
      });

    logger.info('User product snippet updated successfully.');
  } catch (error) {
    logger.error('Error updating product snippet:', error.message);
  }
};