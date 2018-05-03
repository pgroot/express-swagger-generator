const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const port = process.env.PORT || 1234;
const app = express();
const swaggerGenerator = require('../index.js');

const expressSwagger = swaggerGenerator(app);
const options = {
  swaggerDefinition: {
    info: {
      description: 'This is the generator test',
      title: 'Swagger generator test',
      version: '1.0.0'
    },
    host: 'localhost:' + port,
    basePath: '/api/v1',
    produces: ['application/json', 'application/xml'],
    schemes:
      process.env.NODE_ENV === 'development' ? ['http', 'https'] : ['https']
  },
  docUrl: '/docs',
  basedir: __dirname, // app absolute path
  files: ['./src/modules/**/*.js'] // Path to the API handle folder
};

try {
  console.log('Setting up Swagger generator');
  expressSwagger(options);
  console.log('Done');
} catch (err) {
  console.warn(`Swagger failed: ${err}`);
}

app.get('/', (req, res) => res.status(200).send({ message: 'Sanity test' }));

app.listen(port, () =>
  console.log(`Express server listening on port: ${port}`)
);
