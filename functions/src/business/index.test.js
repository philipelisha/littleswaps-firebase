import { getMetrics } from "./index.js";
import admin from '../../adminConfig.js';
import { logger } from 'firebase-functions';

jest.mock('../../adminConfig.js');
const mockGet = jest.fn();
const mockAdd = jest.fn();
admin.firestore = jest.fn().mockReturnValue({
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  add: mockAdd,
  get: mockGet,
  where: jest.fn().mockReturnThis(),
  count: jest.fn().mockReturnThis(),
});
admin.firestore.Timestamp = {
  now: () => 'now',
  fromMillis: () => 'mils',
}
jest.spyOn(console, 'error').mockImplementation(() => { })
jest.spyOn(console, 'info').mockImplementation(() => { })
jest.spyOn(logger, 'info').mockImplementation(() => {});
describe('Getting the business weekly metrics', () => {
  beforeEach(async () => {
    const now = Math.floor(Date.now() / 1000);
    const today = now - 24 * 60 * 60;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60;
    const threeDaysAgo = now - 3 * 24 * 60 * 60;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60;
    const twelveMonthsAgo = now - 365 * 24 * 60 * 60;
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
    const purchases = [
      {
        data: () => ({
          purchaseDate: {
            seconds: today + 100
          },
          purchasePriceDetails: {
            commission: 10,
            tax: 5
          }
        })
      },
      {
        data: () => ({
          purchaseDate: {
            seconds: sevenDaysAgo + 100
          },
          purchasePriceDetails: {
            commission: 15,
            tax: 10
          }
        })
      },
      {
        data: () => ({
          purchaseDate: {
            seconds: threeDaysAgo + 100
          },
          purchasePriceDetails: {
            commission: 20,
            tax: 15
          }
        })
      },
      {
        data: () => ({
          purchaseDate: {
            seconds: thirtyDaysAgo + 100
          },
          purchasePriceDetails: {
            commission: 25,
            tax: 20
          }
        })
      },
      {
        data: () => ({
          purchaseDate: {
            seconds: twelveMonthsAgo + 100
          },
          purchasePriceDetails: {
            commission: 30,
            tax: 25
          }
        })
      },
      {
        data: () => ({
          purchaseDate: {
            seconds: startOfYear + 100
          },
          purchasePriceDetails: {
            commission: 35,
            tax: 30
          }
        })
      },
    ]
    mockGet.mockResolvedValueOnce({
      data: () => ({ count: 1 })
    })
    mockGet.mockResolvedValueOnce({
      data: () => ({ count: 2 })
    })
    mockGet.mockResolvedValueOnce({
      data: () => ({ count: 3 })
    })
    mockGet.mockResolvedValueOnce({
      data: () => ({ count: 4 })
    })
    mockGet.mockResolvedValueOnce({
      data: () => ({ count: 5 })
    })
    mockGet.mockResolvedValueOnce(purchases)
    mockGet.mockResolvedValueOnce({
      docs: [{
        id: '123'
      }]
    })
    mockGet.mockResolvedValueOnce({
      data: () => ({
        count: 6
      })
    })
  });

  it('should fetch the metrics and store them', async () => {
    const expectedResponse = {
      message: 'Metrics stored successfully',
      metrics: {
        timestamp: 'now',
        weeklyActiveUsers: 1,
        newListingsThisWeek: 2,
        purchaseData: {
          today: 1,
          last3Days: 2,
          last7Days: 3,
          last30Days: 4,
          last12Months: 6,
          thisYear: 5
        },
        commission: {
          today: 10,
          last3Days: 30,
          last7Days: 45,
          last30Days: 70,
          last12Months: 135,
          thisYear: 105,
        },
        tax: {
          today: 5,
          last3Days: 20,
          last7Days: 30,
          last30Days: 50,
          last12Months: 105,
          thisYear: 80,
        },
        repeatListingUsers: 3,
        repeatOrderUsers: 1,
        totalUsers: 4,
        newUsersThisWeek: 5
      }
    };
    const response = await getMetrics();

    expect(mockAdd).toHaveBeenCalledWith(expectedResponse.metrics)
    expect(response).toEqual(expectedResponse)
  });
});