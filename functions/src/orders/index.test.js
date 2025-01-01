import { updateOrderStatus } from './index.js';
import { onUpdateOrderStatus } from './onUpdateOrderStatus.js';
import { logger } from 'firebase-functions';
jest.mock('./onUpdateOrderStatus', () => ({
  onUpdateOrderStatus: jest.fn()
}));

jest.mock('firebase-functions', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  https: {
    onCall: jest.fn(),
    HttpsError: jest.fn().mockResolvedValue(),
  },
}));

describe('updateOrderStatus', () => {
  const mockData = { orderId: '12345', status: 'shipped' };
  const mockContext = { auth: { uid: 'user123' } };

  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
  })

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should update order status successfully', async () => {
    onUpdateOrderStatus.mockResolvedValueOnce();

    const result = await updateOrderStatus(mockData, mockContext);

    expect(onUpdateOrderStatus).toHaveBeenCalledWith(mockData);
    expect(result).toEqual({
      success: true,
      message: 'Order status updated successfully.',
    });
  });

  it('should fail if authentication is missing', async () => {
    const result = await updateOrderStatus(mockData, {});

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        status: 'failed to update order status',
      })
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('should handle onUpdateOrderStatus errors', async () => {
    const errorMessage = 'Failed to update order';
    onUpdateOrderStatus.mockRejectedValueOnce(new Error(errorMessage));

    const result = await updateOrderStatus(mockData, mockContext);

    expect(result).toEqual({
      success: false,
      message: errorMessage,
      status: 'failed to update order status',
    });
    expect(logger.error).toHaveBeenCalledWith(JSON.stringify(errorMessage));
  });
});

