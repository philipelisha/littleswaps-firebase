// const adminConfig = require('../adminConfig.js');
// import adminConfig from '../adminConfig.js';
const admin = require('firebase-admin');
const importedUsers = require('./seedData/users');

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
      { name: 'Barbie', search: 'barbie' },
      { name: 'Baby Gap', search: 'baby gap' },
      { name: 'Graco', search: 'graco' },
      { name: 'Janie and Jack', search: 'janie and jack' },
      { name: 'LEGO', search: 'lego' },
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
        sizes: { default: ['XS', 'S', 'M', 'L', 'XL'], Baby: ['NB', '3M', '6M', '9M', '12M'] },
        subcategory: ['Tops', 'Bottoms', 'Outerwear', 'Sleepwear', 'Baby'],
      },
      {
        name: 'Toys',
        sizes: { default: ['OS'] },
        subcategory: [
          "Educational Toys", "Stuffed Animals", "Building Blocks", "Board Games", "Dolls and Action Figures", "Outdoor Toys", "Remote Control Toys", "Puzzles", "Arts and Crafts Kits", "Musical Toys", "Pretend Play & Dress-Up", "Vehicles & Playsets", "Electronic Toys", "Baby & Toddler Toys", "Water Toys", "Push Walkers", "Slides"
        ],
      },
    ];
    for (const category of categories) {
      await db.collection('categories').add(category);
    }

    // Seed Trending Brands
    const trendingBrands = [
      {
        name: 'LEGO',
        image: 'https://firebasestorage.googleapis.com/v0/b/babalu-476f1.appspot.com/o/app%2Fbrands%2Flego.jpg?alt=media&token=f143823d-c517-4bf6-8c0e-6c1697d00f87',
      },
      {
        name: 'Graco',
        image: 'https://firebasestorage.googleapis.com/v0/b/babalu-476f1.appspot.com/o/app%2Fbrands%2Fgraco.jpg?alt=media&token=7ecc9c37-5725-48c3-8405-689e1217d80c',
      },
      {
        name: 'Janie and Jack',
        image: 'https://firebasestorage.googleapis.com/v0/b/babalu-476f1.appspot.com/o/app%2Fbrands%2Fjanie-and-jack.jpg?alt=media&token=4b7fbb41-62f5-4de1-8d07-0b5c8ef0928d',
      },
    ];
    for (const brand of trendingBrands) {
      await db.collection('trendingbrands').add(brand);
    }
    console.log('Trending brands seeded.');

    const users = [];
    for (const user of importedUsers) {
      await auth.createUser({
        email: user.email,
        password: '111111',
        displayName: `${user.firstName} ${user.lastName}`,
      });

      const fetchedUser = await admin.auth().getUserByEmail(user.email);
      const uid = fetchedUser.uid;

      users.push({
        ...user,
        id: uid,
      });
    }

    for (const user of users) {
      await db.collection('users').doc(user.id).set(user);
      await db.collection('usernames').doc(user.username).set({ user: user.id });
    }
    console.log('Users and usernames seeded.');

    console.log('Database seeding complete!');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

seedDatabase();
