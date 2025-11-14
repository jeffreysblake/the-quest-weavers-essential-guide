module.exports = {
  "testEnvironment": "node",
  "transform": {
    "^.+\\.(t|j)s$": ["ts-jest", {
      "tsconfig": {
        "sourceMap": false
      }
    }]
  },
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "./src",
  "testRegex": "\\.(test|spec)\\.ts$",
  "collectCoverageFrom": [
    "**/*.(t|j)s"
  ],
  "coverageDirectory": "../coverage",
  "setupFilesAfterEnv": ["<rootDir>/setupTests.ts"]
};