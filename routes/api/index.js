var express = require('express');
var router = express.Router();

var shortcuts = require('./shortcuts');

/* GET users listing. */
router.use('/shortcuts', shortcuts);

module.exports = router;
