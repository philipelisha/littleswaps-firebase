import { logger, https } from "firebase-functions";
import admin from '../../adminConfig.js';
import { updateUsersListingCounts } from "./updateUsersListingCounts.js";
import { updateProductSnippet } from "./updateProductSnippet.js";
import { deleteProductReferences } from "../users/deleteUser.js";

export const deleteProductSingle = async (data, context) => {
  try {
    if (!context.auth) {
      throw new https.HttpsError("unauthenticated", "Authentication required.");
    }

    const { productId } = data;
    const db = admin.firestore();
    const batch = db.batch();

    const product = await db.collection("products").doc(productId).get();

    if (!product.exists) {
      throw new https.HttpsError("not-found", "Product not found.");
    }

    const productData = product.data();

    if (!productData.purchaseDate) {
      await deleteProductReferences({
        batch,
        db,
        doc: product,
        currentUser: productData.user,
        productUniqueKey: productData.key,
      });

      batch.delete(product.ref);

      console.log(`Queued removal of product with product id: ${product.id}`);

      await batch.commit();
    }

    try {
      updateUsersListingCounts(productData.user, {
        isActive: false,
        updatingActive: false,
        isSold: false,
        isDeleted: true,
        isActiveBeforeDelete: productData.active,
      });
    } catch (error) {
      logger.error(`Error updating the user(${productData.user}) listings count: `, error.message);
    }

    try {
      updateProductSnippet(productData.user);
    } catch (error) {
      logger.error(`Error updating the product snippet with user(${productData.user}):`, error.message);
    }
  } catch (error) {
    console.error("Error:", error.message);
    throw new https.HttpsError("internal", "Internal Server Error");
  }
};