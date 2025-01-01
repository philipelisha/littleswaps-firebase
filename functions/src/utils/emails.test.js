import admin from '../../adminConfig.js';
import { logger } from 'firebase-functions';
import { sendEmail, emailTemplates } from './emails.js';

jest.mock('../../adminConfig.js');
const mockCollection = jest.fn();
const mockAdd = jest.fn();

admin.firestore = jest.fn(() => ({
  collection: mockCollection,
}));
mockCollection.mockReturnValue({ add: mockAdd });

jest.mock('firebase-functions', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('sendEmail function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send an email successfully', async () => {
    mockAdd.mockResolvedValueOnce({ id: 'mockedEmailId' });

    const response = await sendEmail({
      email: 'test@example.com',
      data: { name: 'John Doe' },
      templateId: emailTemplates.USER_SIGN_UP,
    });

    expect(mockCollection).toHaveBeenCalledWith('emails');
    expect(mockAdd).toHaveBeenCalledWith({
      to: [{ email: 'test@example.com', name: 'John Doe' }],
      from: { email: 'no-reply@littleswaps.com', name: 'Little Swaps' },
      template_id: emailTemplates.USER_SIGN_UP,
      personalization: {
        data: {
          email: 'test@example.com',
          data: { name: 'John Doe' },
        },
      },
    });

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Preparing to send email to: test@example.com')
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Email document created successfully')
    );
    expect(response).toBe('Email document created successfully');
  });

  it('should log and return an error if firestore add fails', async () => {
    mockAdd.mockRejectedValueOnce(new Error('Firestore error'));

    const response = await sendEmail({
      email: 'test@example.com',
      data: { name: 'John Doe' },
      templateId: emailTemplates.USER_SIGN_UP,
    });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error creating email document for: test@example.com'),
      expect.any(Error)
    );
    expect(response).toBe('Error creating email document');
  });

  it('should return an error for invalid email data', async () => {
    const response = await sendEmail({ email: '', data: {}, templateId: emailTemplates.USER_SIGN_UP });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Invalid email data provided')
    );
    expect(response).toBe('Invalid email data');
  });

  it('should return an error if no email is provided', async () => {
    const response = await sendEmail({ data: { name: 'John Doe' }, templateId: emailTemplates.USER_SIGN_UP });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Invalid email data provided')
    );
    expect(response).toBe('Invalid email data');
  });
});
