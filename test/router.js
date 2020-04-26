var express = require('express');
var router = express.Router();

/* GET users listing. */
router.get('/', function(req, res, next) {
    res.send('respond with a resource');
});


/**
 * JSON parameters require a model. This one just has "name"
 * @typedef ReqNameJSON
 * @property {string} name.required - name of person making request - eg: John Doe
 */
/**
 * This route will respond greetings to name in json request body.
 * @summary greetings to name
 * @route POST /hello/
 * @group hello - Test Demo
 * @param {ReqNameJSON.model} name.body.required - username or email
 * @returns {object} 200 - An object with the key 'msg'
 * @returns {Error}  default - Unexpected error
 * @headers {integer} 200.X-Rate-Limit - calls per hour allowed by the user
 * @headers {string} 200.X-Expires-After - 	date in UTC when token expires
 * @produces application/json
 * @consumes application/json
 */
router.post("/", function() {});



/**
 * @typedef Product
 * @property {integer} id
 * @property {string} name.required - Some description for product
 * @property {Array.<Point>} Point
 */

/**
 * @typedef Point
 * @property {integer} x.required
 * @property {integer} y.required - Some description for point - eg: 1234
 * @property {Array.<Color>} Color
 */

/**
 * @typedef Color
 * @property {string} blue
 */

/**
 * @route GET /test/
 * @returns {Array.<Point>} Point - Some description for point
 */
router.get('/test', function() {});

module.exports = router;
