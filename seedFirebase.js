// const adminConfig = require('../adminConfig.js');
// import adminConfig from '../adminConfig.js';
const admin = require('firebase-admin');

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

// Initialize Firebase Admin SDK
admin.initializeApp({
  projectId: 'babalu-476f1',
});
admin.firestore().settings({
  host: 'localhost:8080',
  ignoreUndefinedProperties: true,
  ssl: false
});

const db = admin.firestore();
const auth = admin.auth();

async function seedDatabase() {
  try {
    console.log('Seeding database...');

    // Seed Brands
    const brands = [
      { name: 'Little Tikes', search: 'little tikes' },
      { name: 'Fisher-Price', search: 'fisher-price' },
      { name: 'Melissa & Doug', search: 'melissa & doug' },
    ];
    for (const brand of brands) {
      await db.collection('brands').add(brand);
    }
    console.log('Brands seeded.');

    // Seed Categories
    const categories = [
      {
        name: 'Furniture',
        sizes: { default: ['OS'] },
        subcategory: ['Cribs and Bassinets', 'Changing Tables', 'Kid-sized Furniture', 'Toy Chests'],
      },
      {
        name: 'Clothing',
        sizes: { default: ['XS', 'S', 'M', 'L', 'XL'], baby: ['NB', '3M', '6M', '9M', '12M'] },
        subcategory: ['Tops', 'Bottoms', 'Outerwear', 'Sleepwear'],
      },
    ];
    for (const category of categories) {
      await db.collection('categories').add(category);
    }
    console.log('Categories seeded.');


    const user1 = {
      appIdentifier: 'com.littleswaps',
      badgeCount: 0,
      createdAt: 1737139817,
      email: 'philipleesha@gmail.com',
      firstName: 'Philip',
      lastName: 'Leesha',
      lastOnlineTimestamp: 1737139820,
      location: '',
      parentInfo: { isParent: 'NO_ANSWER' },
      phone: '',
      profileImage: 'https://firebasestorage.googleapis.com/v0/b/babalu-476f1.appspot.com/o/app%2Fprofile%2FdefaultProfileImage.png?alt=media',
      pushKitToken: '',
      pushToken: 'e-Uqs7TvWUCcijLM5Ghyh2:APA91bE08CoFiPy7HjDFjATi4h-E--6TeuGphOjabvaMs8D3e9XcZTEmD1dpFz-s9qTOg7pkgnu6bFfNYH1ac8VF8fwBbWKmFcNcYgNx9yQPnyMt_mFsP8E',
      signUpLocation: '',
      username: 'philip',
    };
    const user2 = {
      appIdentifier: 'com.littleswaps',
      badgeCount: 0,
      createdAt: 1737139818,
      email: 'philipleesha1@gmail.com',
      firstName: 'Philip1',
      lastName: 'Leesha1',
      lastOnlineTimestamp: 1737139821,
      location: '',
      parentInfo: { isParent: 'NO_ANSWER' },
      phone: '',
      profileImage: 'https://firebasestorage.googleapis.com/v0/b/babalu-476f1.appspot.com/o/app%2Fprofile%2FdefaultProfileImage.png?alt=media',
      pushKitToken: '',
      pushToken: 'e-Uqs7TvWUCcijLM5Ghyh3:APA91bE08CoFiPy7HjDFjATi4h-E--6TeuGphOjabvaMs8D3e9XcZTEmD1dpFz-s9qTOg7pkgnu6bFfNYH1ac8VF8fwBbWKmFcNcYgNx9yQPnyMt_mFsP8F',
      signUpLocation: '',
      username: 'philip1',
    };
    const authUser1 = await auth.createUser({
      email: user1.email,
      password: '12345678f',
      displayName: `${user1.firstName} ${user1.lastName}`,
    });
    const authUser2 = await auth.createUser({
      email: user2.email,
      password: '12345678f',
      displayName: `${user2.firstName} ${user2.lastName}`,
    });
    const fetchedUser1 = await admin.auth().getUserByEmail(user1.email);
    uid1 = fetchedUser1.uid;
    const fetchedUser2 = await admin.auth().getUserByEmail(user2.email);
    uid2 = fetchedUser2.uid;
    // Seed Users
    const users = [{
      ...user1,
      id: uid1
    }, {
      ...user2,
      id: uid2
    }];
    for (const user of users) {
      const userRef = await db.collection('users').doc(user.id).set(user);
      await db.collection('usernames').doc(user.username).set({ user: user.id });
    }
    console.log('Users and usernames seeded.');

    console.log('Database seeding complete!');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

seedDatabase();
