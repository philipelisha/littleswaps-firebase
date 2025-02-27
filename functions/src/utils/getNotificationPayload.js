import { orderActions, statusTypes } from '../../order.config.js';
import { logger } from 'firebase-functions';
const { productStatus } = statusTypes;

export const getNotificationPayload = (type, args) => {
  let notificationPayload;

  switch (type) {
    case 'buyer_' + productStatus.PENDING_SHIPPING:
    case 'buyer_' + productStatus.PENDING_SWAPSPOT_ARRIVAL:
      notificationPayload = {
        message: {
          notification: {
            title: '📦 Order Confirmed!',
            body: `Your order for ${args.title} has been placed successfully. We'll notify you when it's shipped!`,
          }
        },
      };
      break;

    case 'buyer_' + productStatus.LABEL_CREATED:
      notificationPayload = {
        message: {
          notification: {
            title: '📦 Shipping label created!',
            body: `Your order for ${args.title} has a shipping label. We'll notify you when it's shipped!`,
          }
        },
      };
      break;

    case 'buyer_' + productStatus.SHIPPED:
      notificationPayload = {
        message: {
          notification: {
            title: '🚚 Your Item is on the way!',
            body: `Your order for ${args.title} has been shipped. Track its progress in the app.`,
          }
        },
      };
      break;

    case 'buyer_' + productStatus.OUT_FOR_DELIVERY:
      notificationPayload = {
        message: {
          notification: {
            title: '🚚 Your Item is out for delivery!',
            body: `Your order for ${args.title} is out for delivery. Track its progress in the app.`,
          }
        },
      };
      break;

    case 'buyer_' + productStatus.PENDING_SWAPSPOT_PICKUP:
      notificationPayload = {
        message: {
          notification: {
            title: '📍 Your Item is Ready for Pickup!',
            body: `${args.title} is now available at ${args.swapSpotName}. Pick it up at your convenience!`,
          }
        },
      };
      break;

    case 'buyer_' + productStatus.COMPLETED:
      notificationPayload = {
        message: {
          notification: {
            title: '📝 Rate Your Experience',
            body: `Let us know how your purchase of ${args.title} went. Leave a review and help others!`,
          }
        },
      };
      break;

    case 'seller_' + productStatus.PENDING_SHIPPING:
    case 'seller_' + productStatus.PENDING_SWAPSPOT_ARRIVAL:
      notificationPayload = {
        message: {
          notification: {
            title: '🎉 New Order Received!',
            body: `${args.title} has sold!.`,
          }
        },
      };
      break;

    case 'seller_' + orderActions.DELIVERED:
    case 'seller_' + orderActions.SWAPSPOT_FULFILLMENT:
      notificationPayload = {
        message: {
          notification: {
            title: '🎉 Payment confirmation for your sale!',
            body: `Congratulations! Your payment on Little Swaps has been processed.`,
          }
        },
      };
      break;

    case 'swapspot_' + productStatus.PENDING_SWAPSPOT_ARRIVAL:
      notificationPayload = {
        message: {
          notification: {
            title: '📦 Incoming Package!',
            body: `A new package, ${args.title}, is on its way to your location.`,
          }
        },
      };
      break;

    case 'DELIVERED':
      notificationPayload = {
        message: {
          notification: {
            title: '📍 New Item Delivered!',
            body: `${args.title} has arrived.`,
          }
        },
      };
      break;
    
    // Shipping reminders
    case "seller_shipping_reminder_1":
      notificationPayload = {
        message: {
          notification: {
            title: "🚀 Don't Forget to Ship!",
            body: `Your order for ${args.title} was placed recently. Please ship it soon to keep the buyer happy!`,
          },
        },
      };
      break;
    case "seller_shipping_reminder_2":
      notificationPayload = {
        message: {
          notification: {
            title: "🚀 Shipping Reminder!",
            body: `Reminder: ${args.title} still needs to be shipped. Please send it as soon as possible!`,
          },
        },
      };
      break;
    case "seller_shipping_reminder_3":
      notificationPayload = {
        message: {
          notification: {
            title: "⚠️ Last Chance to Ship!",
            body: `Urgent: ${args.title} must be shipped today! The buyer can request a refund if it is not shipped.`,
          },
        },
      };
      break;
    case "buyer_refund_eligibility":
      notificationPayload = {
        message: {
          notification: {
            title: "💰 Refund Available!",
            body: `Your order for ${args.title} has not been shipped. You may now request a refund if needed.`,
          },
        },
      };
      break;
    default:
      logger.warn(`Unhandled notification type: ${type}`);
      break;
  }

  return notificationPayload;
};