import { logger } from 'firebase-functions';
import admin from '../../adminConfig.js';

export const getMetrics = async () => {
  logger.info("~~~~~~~~~~~~ START getMetrics ~~~~~~~~~~~~");
  try {
    const db = admin.firestore()
    const now = Math.floor(Date.now() / 1000);
    const today = now - 24 * 60 * 60;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60;
    const threeDaysAgo = now - 3 * 24 * 60 * 60;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60;
    const twelveMonthsAgo = now - 365 * 24 * 60 * 60;
    const twelveMonthsAgoTimestamp = admin.firestore.Timestamp.fromMillis(twelveMonthsAgo * 1000);
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
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

    const [
      activeUsersSnapshot,
      newListingsSnapshot,
      repeatUsersSnapshot,
      totalUsersSnapshot,
      newUsersSnapshot,
      purchaseSnapshot,
      orderRepeatUsersSnapshot,
    ] = await Promise.all([
      db.collection("users")
        .where("lastOnlineTimestamp", ">", sevenDaysAgo)
        .count()
        .get(),
      db.collection("products")
        .where("created", ">", sevenDaysAgo)
        .count()
        .get(),
      db.collection("users")
        .where("totalListings", ">", 1)
        .count()
        .get(),
      db.collection("users")
        .count()
        .get(),
      db.collection("users")
        .where("createdAt", ">", sevenDaysAgo)
        .count()
        .get(),
      db.collection("products")
        .where("purchaseDate", ">", twelveMonthsAgoTimestamp)
        .get(),
      db.collection("users")
        .get()
    ])
    const weeklyActiveUsers = activeUsersSnapshot.data().count;
    const newListingsThisWeek = newListingsSnapshot.data().count;
    const repeatListingUsers = repeatUsersSnapshot.data().count;
    const totalUsers = totalUsersSnapshot.data().count;
    const newUsersThisWeek = newUsersSnapshot.data().count;

    purchaseSnapshot.forEach(doc => {
      const data = doc.data()
      const purchaseDate = data.purchaseDate.seconds;
      const {
        commission: purchaseComission = 0,
        tax: purchaseTax = 0
      } = data.purchasePriceDetails || {};
      
      if (purchaseDate >= today) {
        purchaseData.today++;
        commission.today += purchaseComission;
        tax.today += purchaseTax;
      }
      if (purchaseDate >= threeDaysAgo) {
        purchaseData.last3Days++;
        commission.last3Days += purchaseComission;
        tax.last3Days += purchaseTax;
      }
      if (purchaseDate >= sevenDaysAgo) {
        purchaseData.last7Days++;
        commission.last7Days += purchaseComission;
        tax.last7Days += purchaseTax;
      }
      if (purchaseDate >= thirtyDaysAgo) {
        purchaseData.last30Days++;
        commission.last30Days += purchaseComission;
        tax.last30Days += purchaseTax;
      }
      if (purchaseDate >= twelveMonthsAgo) {
        purchaseData.last12Months++;
        commission.last12Months += purchaseComission;
        tax.last12Months += purchaseTax;
      }
      if (purchaseDate >= startOfYear) {
        purchaseData.thisYear++;
        commission.thisYear += purchaseComission;
        tax.thisYear += purchaseTax;
      }
    });

    let repeatOrderUsers = 0;
    for (const userDoc of orderRepeatUsersSnapshot.docs) {
      const ordersSnapshot = await db.collection("users")
        .doc(userDoc.id)
        .collection("orders")
        .count()
        .get();
      if (ordersSnapshot.data().count > 1) repeatOrderUsers++;
    }

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
