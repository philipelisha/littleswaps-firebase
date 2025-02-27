import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
} from 'firebase-functions/v2/firestore';
import functions, { https, pubsub } from "firebase-functions";
import * as followers from "./src/followers/index.js";
import * as likes from "./src/likes/index.js";
import * as products from './src/products/index.js';
import * as users from "./src/users/index.js";
import * as reviews from "./src/users/reviews.js";
import * as payments from './src/payments/index.js';
import * as orders from './src/orders/index.js';
import * as business from './src/business/index.js';
import * as userNotifications from './src/utils/userNotifications.js';

// ### FIRESTORE ###
// user
export const createUser = onDocumentCreated('/users/{userId}', users.createUser);
export const updateUser = onDocumentUpdated('/users/{userId}', users.updateUser);
export const deleteUser = https.onCall(users.deleteUser);
// followers
export const createFollower = onDocumentCreated('/followers/{followerId}', followers.createFollower);
export const deleteFollower = onDocumentDeleted('/followers/{followerId}', followers.deleteFollower);
// products
export const createProduct = onDocumentCreated('/products/{productId}', products.createProduct);
export const updateProduct = onDocumentUpdated('/products/{productId}', products.updateProduct);
export const deleteProduct = onDocumentDeleted('/products/{productId}', products.deleteProduct);
export const shareProduct = https.onCall(products.onShare);
export const searchProducts = functions
  .region("us-central1")
  .runWith({
    vpcConnector: "update-product-postgres",
    vpcConnectorEgressSettings: "PRIVATE_RANGES_ONLY",
  })
  .https.onCall(products.searchProducts);
export const createLike = onDocumentCreated('/likes/{likeId}', likes.createLike);
export const deleteLike = onDocumentDeleted('/likes/{likeId}', likes.deleteLike);
// payments
export const createReview = onDocumentCreated('/users/{userId}/reviews/{reviewId}', reviews.createReview);
export const createOrder = onDocumentCreated('/users/{userId}/orders/{orderId}', orders.createOrder);
export const updateOrderStatus = https.onCall(orders.updateOrderStatus);
export const onNewNotification = https.onCall(userNotifications.onNewNotification);
export const dailyShippingReminder = pubsub.schedule("0 9 * * 1-5").timeZone("America/New_York").onRun(payments.dailyShippingReminder);
// export const dailyShippingReminderTest = https.onRequest(async (req, res) => {
//   const response = await payments.dailyShippingReminder()
//   res.status(200).json(response)
// });

// ### STRIPE ###
export const addCardToPaymentIntent = https.onCall(payments.addCardToPaymentIntent);
export const confirmPaymentIntent = https.onCall(payments.confirmPaymentIntent);
export const createStripeAccount = https.onCall(payments.createStripeAccount);
export const transferPendingPayouts = https.onCall(payments.transferPendingPayouts);
export const getStripeBalance = https.onCall(payments.getStripeBalance);
export const getLinkedAccounts = https.onCall(payments.getLinkedAccounts);
export const createLoginLink = https.onCall(payments.createLoginLink);
export const getEstimatedTaxes = https.onCall(payments.getEstimatedTaxes);
// webhook
export const failedPaymentIntent = https.onRequest(payments.failedPaymentIntent);

// ### SHIPPO ###
export const validateAddress = https.onCall(payments.validateAddress);
export const createShipment = https.onCall(payments.createShipment);
export const createLabel = https.onCall(payments.createLabel);
// webhook
export const saveShippingLabel = https.onRequest(payments.saveShippingLabel);
export const orderTrackingUpdate = https.onRequest(payments.orderTrackingUpdate);

// ### BUSINESS ### 
export const getWeeklyMetrics = pubsub.schedule("every Monday 09:00").timeZone("America/New_York").onRun(business.getMetrics);
// export const getWeeklyMetricsTest = https.onRequest(async (req,res) => {
//   const response = await payments.getMetrics()
//   res.status(200).json(response)
// });