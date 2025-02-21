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
    await deleteUserDocument(db, userId, batch);
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

  console.log(`Queued removal of username with length: ${userNameSnapshot.length}`);
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
        console.log(`Queued removal of comments given for document with userID: ${userId}; like length ${commentsSnapshot.length}`);
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
  console.log(`Queued removal of likes for document with userID: ${userId}; like length ${likesSnapshot.length}`);
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
    following length: ${followerSnapshot.length}follower length ${followingSnapshot.length}`);
};

const deleteReviews = async (db, batch, userId) => {
  const reviewsGivenSnapshot = await db.collection("users")
    .doc(userId)
    .collection("reviewsGiven")
    .get();
  const promises = [];

  reviewsGivenSnapshot.forEach((reviewDoc) => {
    const reviewData = reviewDoc.data();
    const sellerDoc = db.collection("users")
      .doc(reviewData.seller);

    const promise = sellerDoc.collection("reviews")
      .where("buyer", "==", userId)
      .get()
      .then((reviewsSnapshot) => {
        reviewsSnapshot.forEach((sellerReviewDoc) => {
          batch.delete(sellerReviewDoc.ref);
        });
        console.log(`Queued removal of reviews given for documents with userID: ${userId}`);
      });
    promises.push(promise);
  });

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

const deleteUserDocument = async (db, userId, batch) => {
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
    console.warn(`Failed to delete subcollections for userId: ${userId}`, error);
  }
};

const deleteProductReferences = async ({
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
    await removeProductFromUserComments({
      db,
      productRef,
      productId,
      batch,
    });
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