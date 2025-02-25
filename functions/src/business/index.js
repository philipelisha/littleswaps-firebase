import { logger } from 'firebase-functions';
import admin from '../../adminConfig.js';

export const getMetrics = async (args) => {
  logger.info("~~~~~~~~~~~~ START getMetrics ~~~~~~~~~~~~");
  try {
    const db = admin.firestore()
    const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds
    const sevenDaysAgo = now - 7 * 24 * 60 * 60;
    const threeDaysAgo = now - 3 * 24 * 60 * 60;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60;
    const twelveMonthsAgo = now - 365 * 24 * 60 * 60;
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;

    // Weekly Active Users (WAUs)
    const activeUsersSnapshot = await db.collection("users")
      .where("lastOnlineTimestamp", ">", sevenDaysAgo)
      .count()
      .get();
    const weeklyActiveUsers = activeUsersSnapshot.data().count;

    // New Listings Per Week
    const newListingsSnapshot = await db.collection("products")
      .where("created", ">", sevenDaysAgo)
      .count()
      .get();
    const newListingsThisWeek = newListingsSnapshot.data().count;

    // Transaction Volume
    const purchaseSnapshot = await db.collection("products")
      .where("purchaseDate", ">", twelveMonthsAgo)
      .get();
    let purchaseData = {
      today: 0,
      last3Days: 0,
      last7Days: 0,
      last30Days: 0,
      last12Months: 0,
      thisYear: 0,
    };
    let commission = {
      today: 0,
      last3Days: 0,
      last7Days: 0,
      last30Days: 0,
      last12Months: 0,
      thisYear: 0,
    };
    let tax = {
      today: 0,
      last3Days: 0,
      last7Days: 0,
      last30Days: 0,
      last12Months: 0,
      thisYear: 0,
    }
    purchaseSnapshot.forEach(doc => {
      const data = doc.data()
      const purchaseDate = data.purchaseDate.seconds; // Timestamp format
      const { commission = 0, tax = 0 } = data.purchasePriceDetails || {};

      if (purchaseDate >= now - 24 * 60 * 60) {
        purchaseData.today++;
        commission.today += commission;
        tax.today += tax;
      }
      if (purchaseDate >= threeDaysAgo) {
        purchaseData.last3Days++;
        commission.last3Days += commission;
        tax.last3Days += tax;
      }
      if (purchaseDate >= sevenDaysAgo) {
        purchaseData.last7Days++;
        commission.last7Days += commission;
        tax.last7Days += tax;
      }
      if (purchaseDate >= thirtyDaysAgo) {
        purchaseData.last30Days++;
        commission.last30Days += commission;
        tax.last30Days += tax;
      }
      if (purchaseDate >= twelveMonthsAgo) {
        purchaseData.last12Months++;
        commission.last12Months += commission;
        tax.last12Months += tax;
      }
      if (purchaseDate >= startOfYear) {
        purchaseData.thisYear++;
        commission.thisYear += commission;
        tax.thisYear += tax;
      }
    });

    // Repeat Usage Rate
    const repeatUsersSnapshot = await db.collection("users")
      .where("totalListings", ">", 1)
      .count()
      .get();
    const repeatListingUsers = repeatUsersSnapshot.data().count;

    const orderRepeatUsersSnapshot = await db.collection("users").get();
    let repeatOrderUsers = 0;
    for (const userDoc of orderRepeatUsersSnapshot.docs) {
      const ordersSnapshot = await db.collection("users")
        .doc(userDoc.id)
        .collection("orders")
        .count()
        .get();
      if (ordersSnapshot.data().count > 1) repeatOrderUsers++;
    }

    // Total Registered Users + New Users Per Week
    const totalUsersSnapshot = await db.collection("users").count().get();
    const totalUsers = totalUsersSnapshot.data().count;

    const newUsersSnapshot = await db.collection("users")
      .where("createdAt", ">", sevenDaysAgo)
      .count()
      .get();
    const newUsersThisWeek = newUsersSnapshot.data().count;

    const metricsData = {
      timestamp: admin.firestore.Timestamp.now(),
      weeklyActiveUsers,
      newListingsThisWeek,
      purchaseData,
      commission,
      tax,
      repeatListingUsers,
      repeatOrderUsers,
      totalUsers,
      newUsersThisWeek
    };

    await db.collection("metrics").add(metricsData);

    return { message: "Metrics stored successfully", metrics: metricsData };

  } catch (error) {
    console.error("Error fetching metrics:", error);
    return { error: "Internal server error" };
  }
}
