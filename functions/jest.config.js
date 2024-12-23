export default {
  testEnvironment: 'node',
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: ["src/**", "!src/utils/index.js", "!src/users/**"],
  coverageDirectory: 'coverage',
  coverageReporters: ['json', 'lcov', 'text', 'html'],
  coverageDirectory: '<rootDir>/coverage',
};
