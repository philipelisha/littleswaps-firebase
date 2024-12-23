import { https } from 'firebase-functions'
import { addCardToPaymentIntent, confirmPaymentIntent } from './index'

const stripeMock = {
  paymentMethods: {
    create: jest.fn().mockResolvedValue({}),
    attach: jest.fn().mockResolvedValue({}),
  },
  paymentIntents: {
    update: jest.fn().mockResolvedValue({}),
    confirm: jest.fn().mockResolvedValue({ status: "succeeded" }),
  },
}

/* const stripe = () => {
  // console.log(stripe)
  jest.spyOn(stripe.resources.PaymentIntents.prototype, 'confirm')
    .mockImplementation(() => (
      Promise.resolve({ status: 'succeeded' })
    ));
  jest.spyOn(stripe.resources.PaymentIntents.prototype, 'update')
    .mockImplementation(() => (
      Promise.resolve({id: 'stripe-test-id'})
    ));
  jest.spyOn(stripe.resources.PaymentMethods.prototype, 'create')
    .mockImplementation(() => (
      Promise.resolve({id: 'stripe-test-id'})
    ));
  jest.spyOn(stripe.resources.PaymentMethods.prototype, 'attach')
    .mockImplementation(() => (
      Promise.resolve({id: 'stripe-test-id'})
    ));
  return stripe;
})
 */

jest.mock("firebase-functions", () => ({
  ...jest.requireActual("firebase-functions"),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}))

beforeEach(() => {
  jest.clearAllMocks()
  jest.resetModules()
})

describe("addCardToPaymentIntent", () => {
  it("should add card to payment intent successfully", async () => {
    const data = {
      paymentIntentId: 'someId',
      cardToken: 'someToken',
      customerId: 'someCustomerId',
    }
    const context = { auth: { uid: 'someUserId' } }

    const result = await addCardToPaymentIntent(data, context, stripeMock)

    expect(result.success).toBe(true)
    expect(result.message).toBe("Card added to payment intent successfully.")
  })

  it("should handle error during payment method creation", async () => {
    const errorMessage = "Payment method creation error"
    stripeMock.paymentMethods.create.mockRejectedValueOnce(
      new Error(errorMessage),
    );

    const data = {
      paymentIntentId: 'someId',
      cardToken: 'someToken',
      customerId: 'someCustomerId',
    }
    const context = { auth: { uid: 'someUserId' } }
    const response = await addCardToPaymentIntent(data, context, stripeMock);
    expect(response).toStrictEqual({
      message: "Payment method creation error",
      status: "failed",
      success: false
    })
  })

  it("should handle error during payment method attachment", async () => {
    const errorMessage = "Payment method attachment error"
    stripeMock.paymentMethods.attach.mockRejectedValueOnce(
      new Error(errorMessage),
    )

    const data = {
      paymentIntentId: 'someId',
      cardToken: 'someToken',
      customerId: 'someCustomerId',
    }
    const context = { auth: { uid: 'someUserId' } }
    const response = await addCardToPaymentIntent(data, context, stripeMock);
    expect(response).toStrictEqual({
      message: "Payment method attachment error", 
      status: "failed", 
      success: false
    })
  })

  it("should handle unauthenticated user", async () => {
    const data = {
      paymentIntentId: 'someId',
      cardToken: 'someToken',
      customerId: 'someCustomerId',
    }
    const context = { auth: null }
    const response = await addCardToPaymentIntent(data, context, stripeMock);
    expect(response).toStrictEqual({
      message: "Authentication required.", 
      status: "failed", 
      success: false
    })
  })
})

describe("confirmPaymentIntent", () => {
  it("should confirm payment intent successfully", async () => {
    const data = { paymentIntentId: 'someId' }
    const context = { auth: { uid: 'someUserId' } }

    const result = await confirmPaymentIntent(data, context, stripeMock)

    expect(result.success).toBe(true)
    expect(result.message).toBe("Payment confirmed successfully.")
  })

  it("should handle additional authentication required", async () => {
    const stripe = require("stripe")()
    stripeMock.paymentIntents.confirm.mockResolvedValueOnce({
      status: 'requires_action',
    })

    const data = { paymentIntentId: 'someId' }
    const context = { auth: { uid: 'someUserId' } }

    const result = await confirmPaymentIntent(data, context, stripeMock)

    expect(result.success).toBe(false)
    expect(result.message).toBe("Additional authentication required.")
    expect(result.requiresAction).toBe(true)
  })

  it("should handle error during payment confirmation", async () => {
    const stripe = require("stripe")()
    const errorMessage = "Payment confirmation error"
    stripeMock.paymentIntents.confirm.mockRejectedValueOnce(
      new Error(errorMessage),
    )
    const data = { paymentIntentId: 'someId' }
    const context = { auth: { uid: 'someUserId' } }

    const response = await confirmPaymentIntent(data, context, stripeMock);
    expect(response).toStrictEqual({
      message: "Payment confirmation error", 
      status: "failed", 
      success: false
    })
  })

  it("should handle unexpected payment confirmation status", async () => {
    const stripe = require("stripe")()
    const unexpectedStatus = "unexpected_status"
    stripeMock.paymentIntents.confirm.mockResolvedValueOnce({
      status: unexpectedStatus,
    })

    const data = { paymentIntentId: 'someId' }
    const context = { auth: { uid: 'someUserId' } }

    const result = await confirmPaymentIntent(data, context, stripeMock)

    expect(result.success).toBe(false)
    expect(result.message).toBe("Payment confirmation failed.")
    expect(result.status).toBe(unexpectedStatus)
  })

  it("should handle unauthenticated user", async () => {
    const data = { paymentIntentId: 'someId' }
    const context = { auth: null }

    const response = await confirmPaymentIntent(data, context, stripeMock);

    await expect(response).toStrictEqual({
      message: "Authentication required.", 
      status: "failed", 
      success: false
    })
  })
})
