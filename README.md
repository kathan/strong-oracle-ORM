# strong-oracle-ORM
This is an Object Relational Mapping class for the strong-oracle library.

####Dependencies:
* [strong-oracle](https://github.com/kathan/strong-oracle)

Example:
```js
/*CREATE TABLE test_table(ID NUMBER, NAME VARCHAR2(100), CREATION_DATE TIMESTAMP)*/
var settings = {},
	oracle = require("strong-oracle")(settings),
	ORM = require('strong-oracle-ORM'),
	var connectData = { "hostname": "localhost", "user": "test", "password": "test", "database": "ORCL" };

new ORM(connectData, 'test_table', function(err, tab){
  tab.insert({id:1, name:'Row1', creation_date:new Date()});
});
```
