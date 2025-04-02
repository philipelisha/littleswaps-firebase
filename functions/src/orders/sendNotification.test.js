import { sendNotification } from './sendNotification.js';
import { statusTypes } from '../../order.config.js';
import * as utils from '../utils/index.js';

const { productStatus } = statusTypes;

jest.mock('../utils/index.js', () => ({
  sendNotificationToUser: jest.fn(),
}));

describe('sendNotification', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should send notifications to buyer and seller when status is PENDING_SHIPPING', () => {
    const order = {
      status: productStatus.PENDING_SHIPPING,
      seller: 'sellerId',
      productBundle: null,
      product: { title: 'Product Title' },
    };
    const buyer = 'buyerId';

    sendNotification(order, buyer);

    expect(utils.sendNotificationToUser).toHaveBeenCalledTimes(2);
    expect(utils.sendNotificationToUser).toHaveBeenCalledWith({
      userId: 'buyerId',
      type: 'buyer_PENDING_SHIPPING',
      args: { title: 'Product Title' },
    });
    expect(utils.sendNotificationToUser).toHaveBeenCalledWith({
      userId: 'sellerId',
      type: 'seller_PENDING_SHIPPING',
      args: { title: 'Product Title' },
    });
  });

  it('should send notifications to buyer, seller, and swapspot when status is PENDING_SWAPSPOT_ARRIVAL', () => {
    const order = {
      status: productStatus.PENDING_SWAPSPOT_ARRIVAL,
      seller: 'sellerId',
      selectedSwapSpot: 'swapspotId',
      productBundle: [{ title: 'Product 1' }, { title: 'Product 2' }],
    };
    const buyer = 'buyerId';

    sendNotification(order, buyer);

    expect(utils.sendNotificationToUser).toHaveBeenCalledTimes(3);
    expect(utils.sendNotificationToUser).toHaveBeenCalledWith({
      userId: 'buyerId',
      type: 'buyer_PENDING_SWAPSPOT_ARRIVAL',
      args: { title: 'Product 1 + 1 more' },
    });
    expect(utils.sendNotificationToUser).toHaveBeenCalledWith({
      userId: 'sellerId',
      type: 'seller_PENDING_SWAPSPOT_ARRIVAL',
      args: { title: 'Product 1 + 1 more' },
    });
    expect(utils.sendNotificationToUser).toHaveBeenCalledWith({
      userId: 'swapspotId',
      type: 'swapspot_PENDING_SWAPSPOT_ARRIVAL',
      args: { title: 'Product 1 + 1 more' },
    });
  });

  it('should handle empty productBundle and product gracefully', () => {
    const order = {
      status: productStatus.PENDING_SHIPPING,
      seller: 'sellerId',
      productBundle: null,
      product: { title: 'Product 1' },
    };
    const buyer = 'buyerId';

    sendNotification(order, buyer);

    expect(utils.sendNotificationToUser).toHaveBeenCalledTimes(2);
    expect(utils.sendNotificationToUser).toHaveBeenCalledWith({
      userId: 'buyerId',
      type: 'buyer_PENDING_SHIPPING',
      args: { title: 'Product 1' },
    });
    expect(utils.sendNotificationToUser).toHaveBeenCalledWith({
      userId: 'sellerId',
      type: 'seller_PENDING_SHIPPING',
      args: { title: 'Product 1' },
    });
  });
});