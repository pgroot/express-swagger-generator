// Dependencies
const fs = require("fs");
const glob = require("glob");
const path = require("path");
const parser = require("swagger-parser");
const swaggerHelpers = require("./swagger-helpers");
const doctrineFile = require("doctrine-file");
const swaggerUi = require("swagger-ui-express");

/**
 * Parses the provided API file for JSDoc comments.
 * @function
 * @param {string} file - File to be parsed
 * @returns {object} JSDoc comments
 * @requires doctrine
 */
function parseApiFile(file) {
  const content = fs.readFileSync(file, "utf-8");

  let comments = doctrineFile.parseFileContent(content, {
    unwrap: true,
    sloppy: true,
    tags: null,
    recoverable: true
  });
  return comments;
}

function parseRoute(str) {
  let split = str.split(" ");

  return {
    method: split[0].toLowerCase() || "get",
    uri: split[1] || ""
  };
}
function parseField(str) {
  let split = str.split(".");
  return {
    name: split[0],
    parameter_type: split[1] || "get",
    required: (split[2] && split[2] === "required") || false
  };
}
function parseType(obj) {
  if (!obj) return undefined;
  if (obj.name) {
    const spl = obj.name.split(".");
    if (spl.length > 1 && spl[1] == "model") {
      return spl[0];
    } else return obj.name;
  } else if (obj.expression && obj.expression.name) {
    return obj.expression.name.toLowerCase();
  } else {
    return "string";
  }
}

function parseSchema(obj) {
  if (!obj.name) return undefined;
  const description = obj["description"];

  const spl = obj.name.split(".");
  if (spl.length > 1 && spl[1] == "model") {
    return { $ref: "#/definitions/" + spl[0] };
  }

  if (obj.name === "string" && description && description.startsWith("@enum")) {
    const clean = description.replace(/\'/g, "").replace(/"/g, "");
    const enums = clean.split("@enum")[1];
    return { enum: enums };
  }

  return undefined;
}

function parseItems(obj) {
  if (
    obj.applications &&
    obj.applications.length > 0 &&
    obj.applications[0].name
  ) {
    const type = obj.applications[0].name;
    if (
      type == "object" ||
      type == "string" ||
      type == "integer" ||
      type == "boolean"
    ) {
      return { type: type };
    } else return { $ref: "#/definitions/" + type };
  } else return undefined;
}

function parseReturn(tags) {
  let rets = {};
  let headers = parseHeaders(tags);

  for (let i in tags) {
    if (tags[i]["title"] == "returns" || tags[i]["title"] == "return") {
      let description = tags[i]["description"].split("-"),
        key = description[0].trim();
      rets[key] = {
        description: tags[i]["description"].trim(),
        headers: headers[key]
      };
      const type = parseType(tags[i].type);
      if (type) {
        // rets[key].type = type;
        rets[key].schema = parseSchema(tags[i].type);
      }
    }
  }
  return rets;
}
function parseDescription(obj) {
  return obj.description || "";
}
function parseTag(tags) {
  for (let i in tags) {
    if (tags[i]["title"] == "group") {
      return tags[i]["description"].split("-");
    }
  }
  return ["default", ""];
}

function parseProduces(str) {
  return str.split(/\s+/);
}

function parseConsumes(str) {
  return str.split(/\s+/);
}

function parseTypedef(tags) {
  const typeName = tags[0]["name"];
  let details = {
    required: [],
    properties: {}
  };
  if (tags[0].type && tags[0].type.name) {
    details.allOf = [{ $ref: "#/definitions/" + tags[0].type.name }];
  }
  for (let i = 1; i < tags.length; i++) {
    if (tags[i].title == "property") {
      let propName = tags[i].name;
      const required = propName.split(".")[1];
      if (required && required == "required") {
        propName = propName.split(".")[0];
        details.required.push(propName);
      }
      var schema = parseSchema(tags[i].type);
      if (schema) {
        details.properties[propName] = schema;
      } else {
        details.properties[propName] = {
          type: parseType(tags[i].type),
          description: tags[i].description || "",
          items: parseItems(tags[i].type)
        };
      }
    }
  }
  return { typeName, details };
}

function parseSecurity(comments) {
  let security;
  try {
    security = JSON.parse(comments);
  } catch (e) {
    let obj = {};
    obj[comments] = [];
    security = [obj];
  }
  return security;
}

function parseHeaders(comments) {
  let headers = {};
  for (let i in comments) {
    if (
      comments[i]["title"] === "headers" ||
      comments[i]["title"] === "header"
    ) {
      let description = comments[i]["description"].split(/\s+-\s+/);

      if (description.length < 1) {
        break;
      }
      let code2name = description[0].split(".");

      if (code2name.length < 2) {
        break;
      }

      let type = code2name[0].match(/\w+/);
      let code = code2name[0].match(/\d+/);

      if (!type || !code) {
        break;
      }
      let code0 = code[0].trim();
      if (!headers[code0]) {
        headers[code0] = {};
      }

      headers[code0][code2name[1]] = {
        type: type[0],
        description: description[1]
      };
    }
  }
  return headers;
}

function fileFormat(comments) {
  let route,
    parameters = {},
    params = [],
    tags = [],
    definitions = {};
  for (let i in comments) {
    let desc = parseDescription(comments);
    if (i == "tags") {
      if (
        comments[i].length > 0 &&
        comments[i][0]["title"] &&
        comments[i][0]["title"] == "typedef"
      ) {
        const typedefParsed = parseTypedef(comments[i]);
        definitions[typedefParsed.typeName] = typedefParsed.details;
        continue;
      }
      for (let j in comments[i]) {
        let title = comments[i][j]["title"];
        if (title == "route") {
          route = parseRoute(comments[i][j]["description"]);
          let tag = parseTag(comments[i]);
          parameters[route.uri] = parameters[route.uri] || {};
          parameters[route.uri][route.method] =
            parameters[route.uri][route.method] || {};
          parameters[route.uri][route.method]["parameters"] = [];
          parameters[route.uri][route.method]["description"] = desc;
          parameters[route.uri][route.method]["tags"] = [tag[0].trim()];
          tags.push({
            name: typeof tag[0] === "string" ? tag[0].trim() : "",
            description: typeof tag[1] === "string" ? tag[1].trim() : ""
          });
        }
        if (title == "param") {
          let field = parseField(comments[i][j]["name"]),
            properties = {
              name: field.name,
              in: field.parameter_type,
              description: comments[i][j]["description"],
              required: field.required
            },
            schema = parseSchema(comments[i][j]["type"]);
          // we only want a type if there is no referenced schema
          if (!schema) properties.type = parseType(comments[i][j]["type"]);
          else properties.schema = schema;
          params.push(properties);
        }

        if (title == "operationId" && route) {
          parameters[route.uri][route.method]["operationId"] =
            comments[i][j]["description"];
        }

        if (title == "summary" && route) {
          parameters[route.uri][route.method]["summary"] =
            comments[i][j]["description"];
        }

        if (title == "produces" && route) {
          parameters[route.uri][route.method]["produces"] = parseProduces(
            comments[i][j]["description"]
          );
        }

        if (title == "consumes" && route) {
          parameters[route.uri][route.method]["consumes"] = parseConsumes(
            comments[i][j]["description"]
          );
        }

        if (title == "security" && route) {
          console.log(parseSecurity(comments[i][j]["description"]));
          parameters[route.uri][route.method]["security"] = parseSecurity(
            comments[i][j]["description"]
          );
        }

        if (route) {
          parameters[route.uri][route.method]["parameters"] = params;
          parameters[route.uri][route.method]["responses"] = parseReturn(
            comments[i]
          );
        }
      }
    }
  }
  return { parameters: parameters, tags: tags, definitions: definitions };
}

/**
 * Filters JSDoc comments
 * @function
 * @param {object} jsDocComments - JSDoc comments
 * @returns {object} JSDoc comments
 * @requires js-yaml
 */
function filterJsDocComments(jsDocComments) {
  return jsDocComments.filter(function(item) {
    return item.tags.length > 0;
  });
}

/**
 * Converts an array of globs to full paths
 * @function
 * @param {array} globs - Array of globs and/or normal paths
 * @return {array} Array of fully-qualified paths
 * @requires glob
 */
function convertGlobPaths(base, globs) {
  return globs.reduce(function(acc, globString) {
    let globFiles = glob.sync(path.resolve(base, globString));
    return acc.concat(globFiles);
  }, []);
}

/**
 * Generates the swagger spec
 * @function
 * @param {object} options - Configuration options
 * @returns {array} Swagger spec
 * @requires swagger-parser
 */
module.exports = function(app) {
  return function(options) {
    /* istanbul ignore if */
    if (!options) {
      throw new Error("'options' is required.");
    } /* istanbul ignore if */ else if (!options.swaggerDefinition) {
      throw new Error("'swaggerDefinition' is required.");
    } /* istanbul ignore if */ else if (!options.files) {
      throw new Error("'files' is required.");
    }

    // Build basic swagger json
    let swaggerObject = swaggerHelpers.swaggerizeObj(options.swaggerDefinition);
    let apiFiles = convertGlobPaths(options.basedir, options.files);

    // Parse the documentation in the APIs array.
    for (let i = 0; i < apiFiles.length; i = i + 1) {
      let parsedFile = parseApiFile(apiFiles[i]);
      //console.log(JSON.stringify(parsedFile))
      let comments = filterJsDocComments(parsedFile);

      for (let j in comments) {
        let parsed = fileFormat(comments[j]);
        swaggerHelpers.addDataToSwaggerObject(swaggerObject, [
          {
            paths: parsed.parameters,
            tags: parsed.tags,
            definitions: parsed.definitions
          }
        ]);
      }
    }

    parser.parse(swaggerObject, function(err, api) {
      if (!err) {
        swaggerObject = api;
      }
    });

    app.use("/api-docs.json", function(req, res) {
      res.json(swaggerObject);
    });

    if (!options.docUrl) {
      options.docUrl = "/api-docs";
    }

    app.use(options.docUrl, swaggerUi.serve, swaggerUi.setup(swaggerObject));

    return swaggerObject;
  };
};
