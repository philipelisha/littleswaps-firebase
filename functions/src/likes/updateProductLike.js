import admin from '../../adminConfig.js';
import { getLikeSnippet } from "./getLikeSnippet.js";
import { logger } from "firebase-functions";

export const updateProductLike = async (document, isAdding) => {
  try {
    const likeSnippet = await getLikeSnippet(document);
    await admin
      .firestore()
      .collection("products")
      .doc(document)
      .update({
        likes: admin.firestore.FieldValue.increment(isAdding ? 1 : -1),
        likeSnippet,
      });

    return null;
  } catch (error) {
    logger.error('Error updating like:', error);
    throw error;
  }
};
