module.exports = {
  "testEnvironment": "node",
  "transform": {
    "^.+\\.(t|j)sx?$": ["ts-jest", {
      "tsconfig": {
        "sourceMap": false,
        "jsx": "react-jsx",
        "esModuleInterop": true
      }
    }]
  },
  "moduleFileExtensions": ["js", "json", "ts", "tsx", "jsx"],
  "moduleNameMapper": {
    "^@/(.*)$": "<rootDir>/$1"
  },
  "rootDir": "./src",
  "testRegex": "\\.(test|spec)\\.(ts|tsx)$",
  "collectCoverageFrom": [
    "**/*.(t|j)s"
  ],
  "coverageDirectory": "../coverage",
  "setupFilesAfterEnv": ["<rootDir>/setupTests.ts"]
};