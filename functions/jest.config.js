export default {
  testEnvironment: 'node',
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: ["src/**", "!src/utils/index.js"],
  coverageDirectory: 'coverage',
  coverageReporters: ['json', 'lcov', 'text', 'html'],
  coverageDirectory: '<rootDir>/coverage',
};
