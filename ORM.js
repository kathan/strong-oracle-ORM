/*jshint multistr: true*/
/**************************
	Class: ORM
		An Node.js object relational mapping class. Used to insert, update or delete rows in Oracle tables.
	
	Created by Darrel Kathan Feb 26th, 2015
	Updated by Darrel Kathan Feb 22nd, 2016
**************************/
var settings = {},
	db = require('strong-oracle')(settings), //Oracle bind library for Node.js https://github.com/strongloop/strong-oracle
	extend = require('extend');		//Library for "extending" classes. https://github.com/justmoon/node-extend
 
/**************************
	Function: ORM
		An Node.js object relational mapping class for. Used to insert, update or delete rows in Oracle tables.

**************************/

function ORM(conn, table, callback){
	var self = this;
	this.columns = {};	//Object containing each table column in the for of an ORMColumn
	this.name;			//The name of the table. If the table parameter has a schema in it, this will contain the schema and the name ex. 'mfs.product' 
	this.table = '';		//The name of the table sans schema.
	this.conn;			//The database connection object
	this.schema;		//The schema part of the table name if it has been supplied in the table parameter.
	
	/*this.close = function (){
		this.conn.release();
	}*/
	
	/**************************
		Function describe
			A private function that collects all of the information about each column into the object's "columns" property.
			This is automatically called when an ORM instance is created.
		
		Parameters:
			callback - A function to be called when the insert is complete. Ex. callback(err)
	**************************/
	function describe(callback){
		//console.log('Describing ' +self.name)
		/*Query for all columns in the table and */
		var sql = "SELECT c.COLUMN_NAME,\
							c.DATA_LENGTH,\
							c.NULLABLE,\
							CASE\
								WHEN INSTR(c.data_type, '(') > 1 THEN SUBSTRB(c.data_type, 1, INSTR(c.data_type, '(')-1)\
								ELSE data_type\
							END data_type,\
							(SELECT 'Y'\
								FROM all_constraints cons\
									, all_cons_columns cols\
								WHERE cols.table_name = c.table_name\
								AND cons.constraint_type = 'P'\
								AND cons.constraint_name = cols.constraint_name\
								AND cons.owner = cols.owner\
								AND cols.column_name = c.column_name) Primary\
					FROM all_tab_columns c\
					WHERE table_name='"+self.table.toUpperCase()+"'";
		if(self.schema){
			sql += " AND owner = '"+self.schema.toUpperCase()+"'";
		}
		//console.log(sql);
		
		self.conn.execute(sql, [], function(err, result){
			var i,
				row,
				column;
				
			//console.log('rows.length:'+result.rows.length);
			if(err){
				return callback(err);
			}else if(result.length === 0){
				//If there are no rows returned, there's no table.
				return callback('Error: Could not find table "'+self.name+'"');
			}else{
				//console.log(rows);
				for(i=0; result.length > i; i++){
					
					row = result[i];
					
					if(!self.columns[row.COLUMN_NAME]){
						//console.log(row.COLUMN_NAME);
						column = new ORMColumn(self, row.COLUMN_NAME);
						column.type = row.DATA_TYPE;
						column.length = row.DATA_LENGTH;
					
						row.PRIMARY == 'Y' ? column.is_primary = true : '';
						row.NULLABLE == 'Y' ? column.not_null = false : '';
						self.columns[row.COLUMN_NAME] = column;
					}
				}
				return callback();
			}
		});
	}
 
	/**************************
		Function: insert
			A method to insert a row into a table.
			
		Parameters:
			input - An object that has the table column/value pairs to insert. Ex {ID:1, NAME:'Darrel Kathan'} 
			callback - A function to be called when the insert is complete. Ex. callback(err, result)
	**************************/
	this.insert = function(input, callback){
		var column_names = '',
			values = '',
			column,
			pks = getPrimaryKeys(),
			pk_obj,
			i,
			bind_obj = [],
			pk,
			sql = 'INSERT INTO '+this.name+'(';
		console.log('input:', input);
		for(column in input){
			var column_name = null;	
			if(this.columns[column]){
				column_name = column;
			}else if(this.columns[column.toUpperCase()]){
				column_name = column.toUpperCase();
			}else if(this.columns[column.toLowerCase()]){
				column_name = column.toLowerCase();
			}
			
			if(column_name){
			  console.log('found:'+column_name+'='+input[column_name]);
				if(column_names !== ''){
					column_names += ', ';
					values += ', ';
				}
				column_names += column;
				values += ':'+bind_obj.push(input[column_name]);
				
			}else{
				return callback('"'+column+'" column was not found in '+self.name+' table. ORM.insert');
			}
		}
		sql += column_names+') VALUES('+values+')';
			
		if(pks.length > 0){
			sql += " RETURNING ";
			for(i=0; pks.length > i; i++){
				pk_obj = pks[i];
				i > 0 ? sql += ',' : '';
				pk = pk_obj.name;
				sql += pk+' ';
			}
		
			sql += "INTO";
		
			for(i=0; pks.length > i; i++){
				pk_obj = pks[i];
				i > 0 ? sql += ',' : '';
				pk = pk_obj.name;
				
				sql += ' :'+bind_obj.push(new db.OutParam(pk_obj.getOraType()));
			}
		}
		this.binds = bind_obj;
		this.sql = sql;
		this.conn.execute(sql, bind_obj, function(err, result){
			var result_cpy;
			extend(result_cpy, result);
			//self.conn.release(function(err){});
			
			if(err){
				err.sql = sql;
				return callback(err.toString());
			}
			result.sql = sql;
			result.binds = bind_obj;
			return callback(null, result);
			
		});
	};
	
	this.add = function(input, callback){
		return this.insert(input, callback);
	};
	
	/**************************
		Function: update
			A method to update a row in a table.
			
		Parameters:
			input - An object that has the table column/value pairs to update. Ex {ID:1, NAME:'Darrel Kathan'} 
			callback - A function to be called when the insert is update. Ex. callback(err, result)
	**************************/
	this.update = function(query, input, callback){
		var set_str = '',
			clause = 'WHERE',
			column,
      column_name,
			bind_obj = [],
			sql = 'UPDATE '+this.name+' SET ';
		
		for(column in input){
			column_name = null;
			if(this.columns[column]){
				column_name = column;
			}else if(this.columns[column.toUpperCase()]){
				column_name = column.toUpperCase();
			}else if(this.columns[column.toLowerCase()]){
				column_name.toLowerCase();
			}
			
			if(column_name){
				set_str !== '' ? set_str += ', ' : '';
				set_str += column_name+' = :'+bind_obj.push(input[column_name]);
				
			}else{
				return callback('"'+column+'" column was not found in '+self.name+' table. ORM.update input');
			}
		}
		sql += set_str;
		
		for(column in query){
			column_name = null;
			if(this.columns[column]){
				column_name = column;
			}else if(this.columns[column.toUpperCase()]){
				column_name = column.toUpperCase();
			}else if(this.columns[column.toLowerCase()]){
				column_name.toLowerCase();
			}
			
			if(column_name){
				sql += ' '+clause+' '+column_name+' = :'+bind_obj.push(query[column_name]);
				
				clause = 'AND';
			}else{
				return callback('"'+column+'" column was not found in '+self.name+' table. ORM.update query');
			}
		}
		
		//console.log(sql, bind_obj);
		this.sql = sql;
		this.binds = bind_obj;
				
		this.conn.execute(sql, bind_obj, function(err, result){
			//console.log('Update complete');
			if(err){
				
				return callback(err.toString());
			}
			return callback(null, result);
		});
	};
	
	/**************************
		Function: delete
			A method to delete a row from a table.
			
		Parameters:
			input - An object that has the table column/value pairs to delete. Entering '*' will delete everything. Ex. 1 {ID:1} / Ex. 2 '*'
			callback - A function to be called when the insert is update. Ex. callback(err, result)
	**************************/
	this.delete = function(query, input, callback){
		var clause = 'WHERE',		//The current clause in the WHERE expression

      column,
      column_name,

			bind_obj = {},
			sql = "DELETE FROM ".this.name;
		
		for(column in query){
			column_name = null;
			if(this.columns[column]){
				column_name = column;
			}else if(this.columns[column.toUpperCase()]){
				column_name = column.toUpperCase();
			}else if(this.columns[column.toLowerCase()]){
				column_name.toLowerCase();
			}
			
			if(column_name){
				sql += ' '+clause+' '+column_name+' = :'+bind_obj.push(query[column_name]);
				
				clause = 'AND';
			}else{
				return callback('"'+column+'" column was not found in '+self.name+' table. ORM.update query');
			}
		}
		this.sql = sql;
		this.binds = bind_obj;
		this.conn.execute(sql, bind_obj, function(err, result){
			if(err){
				
				return callback(err.toString());
			}else{
				return callback(null, result);
			}
		});
	};
	
	/**************************
		Function: commit
			Commits DML statements to the database.
			
		Parameters:
			callback - is called when commit is complete.
	**************************/
	this.commit = function(callback){
		this.conn.commit(callback);
	};
	
	/**************************
		Function: rollback
			Rolls back DML statements from the database.
			
		Parameters:
			callback - is called when rollback is complete.
	**************************/
	this.rollback = function(callback){
		this.conn.rollback(callback);
	};
	
	/**************************
		Function: getPrimaryKeys
			Private function
		
		Returns: Array of primary key column objects.
	**************************/
	function getPrimaryKeys(){
		var pks = [],
			key,
			column;
		for(key in self.columns){
			column = self.columns[key];
			column.is_primary ? pks.push(column) : '';
		}
		return pks;
	}
	
	/* Object initialization */
	if(!table){
		return callback('Error: ORM requires a table name.');
	}else{
		if(table.indexOf('.') > 0){
			var n = table.split('.');
			this.schema = n[0];
			this.table = n[1];
			this.name = table;
		}else{
			this.name = table;
			this.table = table;
		}
	}
	//Make connection
	if(conn.constructor.name === 'Connection'){
		self.conn = conn;
		describe(function(err){
			if(err){
				return callback(err);
			}
			return callback(null, self);
		});
	}else if(typeof conn === 'object'
			&& conn.hasOwnProperty('hostname') && typeof conn.hostname === 'string'
			&& conn.hasOwnProperty('database') && typeof conn.database === 'string'
			&& conn.hasOwnProperty('username') && typeof conn.username === 'string'
			&& conn.hasOwnProperty('password') && typeof conn.password === 'string'){
		db.connect(conn, function(err, connection){
			
			if(err){
				return callback(err);
			}
			self.conn = connection;
			describe(function(err){
				if(err){
					return callback(err);
				}
				return callback(null, self);
			});
		});
	}else{
		return callback('Error: Invalid connection object.');
	}
}

function ORMColumn(table_o, name){
	this.length;
	this.type;
	this.is_primary;
	this.not_null;
	this.name = name;
	var table_obj = table_o;
	
	/************************
	Function: getOraType
		Returns the oracledb constant that represents the data type. Used in ORM for binding columns.
		
	Returns:
		oracledb constant that represents the data type. 
	************************/
	this.getOraType = function(){
		//console.log('type: '+db.OCCISTRING);
		switch(this.type){
			case 'NUMBER':
				return db.OCCINUMBER;
			case 'DATE':
				return db.OCCIDATE;
			case 'TIMESTAMP':
				return db.OCCIDATE;
			case 'BLOB':
				return db.OCCIBLOB;
			case 'CLOB':
				return db.OCCICLOB;
			default:
				return db.OCCISTRING;

		}
	};
}
 
module.exports = ORM;
