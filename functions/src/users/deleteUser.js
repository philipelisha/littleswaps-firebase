import { https, logger } from "firebase-functions";
import admin from '../../adminConfig.js';

export const deleteUser = async (data, context) => {
  logger.info("~~~~~~~~~~~~ START deleteUser ~~~~~~~~~~~~", data);
  if (!context.auth) {
    throw new https.HttpsError(
      "unauthenticated",
      "You must be authenticated to delete your account."
    );
  }

  const userId = context.auth.uid;
  const batch = admin.firestore().batch();
  const db = admin.firestore();

  try {
    logger.info('deleting the user userId: ', userId);

    await deleteProfileImage(userId);
    await deleteUsername(db, userId, batch);
    await deleteProducts(db, batch, userId);
    await deleteComments(db, batch, userId);
    await deleteLikes(db, batch, userId);
    await deleteFollowersAndFollowings(db, batch, userId);
    await deleteReviews(db, batch, userId);
    await deleteUserNotifications(db, batch, userId);
    await deleteUserDocument(db, batch, userId);
    await deleteUserAuthProfile(userId);

    await batch.commit();

    console.log(`User account and related data deleted successfully with userId: ${userId}.`)
    return {
      success: true,
      message: "User account and related data deleted successfully."
    };
  } catch (error) {
    console.error("Error deleting user account:", error);
    throw new https.HttpsError(
      "internal",
      "An error occurred while deleting the account. Please try again."
    );
  }
}

const deleteProfileImage = async (userId) => {
  const bucket = admin.storage().bucket();
  const profileImagePath = `images/profile/${userId}.jpg`;

  try {
    await bucket.file(profileImagePath).delete();
    console.log(`Deleting profile image with path: ${profileImagePath}`)
  } catch (error) {
    console.warn(`Profile image not found: ${error.message}`);
  }
};

const deleteUsername = async (db, userId, batch) => {
  const userNameSnapshot = await db.collection("usernames")
    .where('user', '==', userId)
    .get();

  userNameSnapshot.forEach((userNameDoc) => {
    batch.delete(userNameDoc.ref);
  });

  console.log(`Queued removal of username with length: ${userNameSnapshot.size}`);
};

const deleteProducts = async (db, batch, userId) => {
  const productsSnapshot = await db.collection("products")
    .where("user", "==", userId)
    .get();

  for (const doc of productsSnapshot.docs) {
    const productData = doc.data();
    if (!productData.purchaseDate) {
      await deleteProductReferences({
        batch,
        db,
        doc,
        currentUser: userId,
        productUniqueKey: productData.key,
      });
      batch.delete(doc.ref);

      console.log(`Queued removal of product with product id: ${doc.id}`);
    } else {
      batch.update(doc.ref, {
        userDeleted: true
      })
    }
  }
};

const deleteComments = async (db, batch, userId) => {
  const userDoc = await db.collection("users").doc(userId).get();
  if (userDoc.exists) {
    const userData = userDoc.data();
    if (userData.comments && Array.isArray(userData.comments)) {
      for (const productId of userData.comments) {
        const commentsRef = db.collection("products").doc(productId).collection("comments");
        const commentsSnapshot = await commentsRef.where("user", "==", userId).get();
        commentsSnapshot.forEach((commentDoc) => {
          batch.delete(commentDoc.ref);
        });
        console.log(`Queued removal of comments given for document with userID: ${userId}; like length ${commentsSnapshot.size}`);
      }
    }
  }
};

const deleteLikes = async (db, batch, userId) => {
  const likesSnapshot = await db.collection("likes")
    .where("user", "==", userId)
    .get();
  likesSnapshot.forEach((likeDoc) => {
    batch.delete(likeDoc.ref);
  });
  console.log(`Queued removal of likes for document with userID: ${userId}; like length ${likesSnapshot.size}`);
};

const deleteFollowersAndFollowings = async (db, batch, userId) => {
  const followersRef = db.collection("followers");
  const followerSnapshot = await followersRef.where("follower", "==", userId).get();
  const followingSnapshot = await followersRef.where("user", "==", userId).get();

  followerSnapshot.forEach((followerDoc) => {
    batch.delete(followerDoc.ref);
  });
  followingSnapshot.forEach((followingDoc) => {
    batch.delete(followingDoc.ref);
  });

  console.log(`Queued removal of followers/following for document with userID: ${userId}; 
    following length: ${followerSnapshot.size}follower length ${followingSnapshot.size}`);
};

const deleteReviews = async (db, batch, userId) => {
  // Not deleting reviews that were given only reviews received
  const promises = [];

  const reviewsSnapshot = await db.collection("users")
    .doc(userId)
    .collection("reviews")
    .get();
  reviewsSnapshot.forEach((reviewDoc) => {
    const reviewData = reviewDoc.data();
    const buyerDoc = db.collection("users")
      .doc(reviewData.buyer);

    const promise = buyerDoc.collection("reviewsGiven")
      .where("seller", "==", userId)
      .get()
      .then((reviewsGivenSnapshot) => {
        reviewsGivenSnapshot.forEach((buyerReviewDoc) => {
          batch.delete(buyerReviewDoc.ref);
        });
        console.log(`Queued removal of reviews for documents with userID: ${userId}`);
      });
    promises.push(promise);
  });

  await Promise.all(promises);
};

const deleteUserNotifications = async (db, batch, userId) => {
  const notificationsRef = db.collection('notifications');
  const usersRef = db.collection('users');

  const [snapshotOthers, snapshotOwner] = await Promise.all([
    notificationsRef.where('userId', '==', userId).get(),
    notificationsRef.where('recipientId', '==', userId).get()
  ]);

  if (snapshotOthers.empty && snapshotOwner.empty) {
    console.log(`No notifications found for user: ${userId}`);
    return;
  }

  let unreadNotificationsByRecipient = {};

  snapshotOthers.forEach((doc) => {
    const data = doc.data();
    if (!data.isRead) {
      const recipientId = data.recipientId;
      if (recipientId) {
        unreadNotificationsByRecipient[recipientId] = (unreadNotificationsByRecipient[recipientId] || 0) + 1;
      }
    }
    batch.delete(doc.ref);
  });

  snapshotOwner.forEach((doc) => {
    batch.delete(doc.ref);
  });

  Object.entries(unreadNotificationsByRecipient).forEach(([recipientId, count]) => {
    batch.update(usersRef.doc(recipientId), {
      notifications: admin.firestore.FieldValue.increment(-count)
    });
  });

  console.log(`Queued deletion of snapshotOthers: ${snapshotOthers.size} and snapshotOwner: ${snapshotOwner.size} notifications for user: ${userId}`);
};

const deleteUserDocument = async (db, batch, userId) => {
  const userDoc = await db.collection("users")
    .doc(userId)
    .get();

  await deleteSubcollections(userDoc.ref, batch);

  if (userDoc.exists) {
    batch.delete(userDoc.ref);
  }
  console.log(`Queued removal of user document with userID: ${userId}`);
};

const deleteUserAuthProfile = async (userId) => {
  await admin.auth().deleteUser(userId);
};

const deleteSubcollections = async (docRef, batch) => {
  try {
    const collections = await docRef.listCollections();

    for (const collection of collections) {
      const subcollectionSnapshot = await collection.get();

      subcollectionSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      console.log(`Queued removal of subcollection.`);
    }
  } catch (error) {
    console.warn(`Failed to delete subcollections for userId: ${docRef.id}`, error);
  }
};

export const deleteProductReferences = async ({
  batch,
  db,
  doc,
  currentUser,
  productUniqueKey
}) => {
  try {
    const { id: productId, ref: productRef } = doc;

    await removeProductImages(currentUser, productUniqueKey);
    await removeLikes(db, productId, batch);
    await removeNotifications(db, productId, batch);
    await removeProductFromUserComments({
      db,
      productRef,
      productId,
      batch,
    });
    await removeProductFromCarts({
      db,
      productRef,
      productId,
      batch
    })
  } catch (error) {
    console.error('error deleting product from firestore', error.message)
  }
}

const removeProductImages = async (currentUser, productUniqueKey) => {
  const imagesPath = `images/products/${currentUser}/${productUniqueKey}/`;
  const bucket = admin.storage().bucket();

  const [files] = await bucket.getFiles({ prefix: imagesPath });
  const deletePromises = files.map((file) => file.delete());
  await Promise.all(deletePromises);

  console.log(`Removed images from path: ${imagesPath}`);
};

const removeLikes = async (db, productId, batch) => {
  const likesRef = db.collection('likes');
  const likesSnapshot = await likesRef.where('product', '==', productId).get();

  likesSnapshot.forEach((likeDoc) => {
    batch.delete(likeDoc.ref);
  });

  console.log(`Queued deletion of likes for product: ${productId}`);
};

const removeNotifications = async (db, productId, batch) => {
  const notificationsRef = db.collection('notifications');
  const snapshot = await notificationsRef.where('productId', '==', productId).get();

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (!data.isRead) {
      const userRef = db.collection("users").doc(data.recipientId);
      batch.update(userRef, {
        notifications: admin.firestore.FieldValue.increment(-1)
      });
    }
    batch.delete(doc.ref);
  });

  console.log(`Queued deletion of notifications for product: ${productId}`);
};

const removeProductFromUserComments = async ({ db, productRef, productId, batch }) => {
  const commentsRef = productRef.collection('comments');
  const commentsSnapshot = await commentsRef.get();

  commentsSnapshot.forEach((commentDoc) => {
    const comment = commentDoc.data();
    const userRef = db.collection('users').doc(comment.user);

    batch.update(userRef, {
      comments: admin.firestore.FieldValue.arrayRemove(productId),
    });
    batch.delete(commentDoc.ref);
  });

  console.log(`Queued removal of product ID from user comments.`);
};

export const removeProductFromCarts = async ({ db, productRef, productId, batch }) => {
  const cartSnapshot = await db
    .collection("carts")
    .where("productIds", "array-contains", productId)
    .get();

  cartSnapshot.forEach((doc) => {
    const cartRef = doc.ref;
    const cartData = doc.data();

    let removedSeller = null;
    const updatedSellers = cartData.sellers
      .map((seller) => {
        const updatedProducts = seller.products.filter(
          (product) => product.productId !== productId
        );

        if (updatedProducts.length === 0) {
          removedSeller = seller.sellerId;
          return null;
        }

        return {
          ...seller,
          products: updatedProducts,
        };
      })
      .filter(Boolean);

    const updatedProductIds = cartData.productIds.filter(
      (id) => id !== productId
    );

    batch.update(cartRef, {
      sellers: updatedSellers,
      productIds: updatedProductIds,
      ...(removedSeller ? {
        sellerIds: admin.firestore.FieldValue.arrayRemove(removedSeller)
      } : {}),
    });
  });

  const userSnapshot = await db
    .collection("users")
    .where("cartItems", "array-contains", productId)
    .get();

  userSnapshot.forEach((doc) => {
    const userRef = doc.ref;

    batch.update(userRef, {
      cartItems: admin.firestore.FieldValue.arrayRemove(productId),
      cartItemsLength: admin.firestore.FieldValue.increment(-1),
    });
  });
}