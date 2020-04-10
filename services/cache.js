const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');
const keys = require("../config/ci");

const client = redis.createClient(keys.redisUrl)
client.get = util.promisify(client.get);

const exec =  mongoose.Query.prototype.exec;


mongoose.Query.prototype.cache = function(options = {}) {
    this.useCache = true;
    this.hashKey = JSON.stringify(options.key || '') ;
    return this; // Mkaing is chainable
}


mongoose.Query.prototype.exec = async function() {
    if (!this.useCache) {
        return exec.apply(this, arguments); 
    }
    const key = JSON.stringify(Object.assign({}, this.getQuery(), {
        collection: this.mongooseCollection.name
    }));
    //

    // See if we have value for key in redis , 
    const cacheValue = await client.get(key);

    //if so return that value
    if (cacheValue) {
        const doc = JSON.parse(cacheValue); // to make the it like monngoose docs
        return Array.isArray(doc) 
            ? doc.map(d => new this.model(d))
            : this.model(doc);
        // const doc = new this.model(JSON.parse(cacheValue)) // to make the it like monngoose docs
        //return JSON.parse(cacheValue); // Wont work directly as exec expects all attributes of Mongoose docs
        // return doc;
    }

    //Otherwise, issue query and store it in redis
    const result = await exec.apply(this, arguments); 
    
    // result.validate will proove that it returns Mongoose docs
    console.log("result", result);
    
    client.set(this.hashKey, JSON.stringify(result), 'EX', 10);
    return result;

}

module.exports = {
    clearHash(hashKey) {
        client.del(JSON.stringify(hashKey)); // delete cache
    }
}


