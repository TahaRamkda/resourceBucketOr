import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import env from "dotenv";
import GoogleStrategy from "passport-google-oauth2"
import AWS from "aws-sdk";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = 3000;
const saltRounds = 10;
env.config();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());

AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});
const s3 = new AWS.S3();


const docClient = new AWS.DynamoDB.DocumentClient();

app.get("/", (req, res) => {
  res.render("ResourceBucket1.ejs");
});

app.get("/verify", (req, res) => {
  res.render('OneTimePassword', { response: '' });
});
app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.get("/ResourceBucket", (req, res) => {
  console.log(req.user);
  if (req.isAuthenticated()) {
    res.render("ResourceBucket.ejs");
  } else {
    res.redirect("/login");
  }
});

app.get("/assignment", async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      const params = {
        Bucket: 'bucketforresources', 
        Prefix: 'assignments/',
      };

      const data = await s3.listObjectsV2(params).promise();

      const topic = data.Contents.map((item, index) => ({
        id: index,
        topic: `Topic ${index + 1}`, 
        link: `https://${params.Bucket}.s3.amazonaws.com/${item.Key}`
      }));

      res.render("content.ejs", {
        title: "Assignment",
        listItems: topic,
      });
    } catch (err) {
      console.log(err);
      res.status(500).send("Error retrieving content");
    }
  } else {
    res.redirect("/login");
  }
});

app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);
app.get(
  "/auth/google/secrets",
  passport.authenticate("google", {
    successRedirect: "/ResourceBucket",
    failureRedirect: "/login",
  })
);
 
app.post('/login', (req, res, next) => {
  passport.authenticate('local', function(err, user, info) {
    if (err) { return next(err); }
    if (!user) {
     
      return res.render('login', { showAnotherWay: info && info.showAnotherWay });
    }
    req.logIn(user, function(err) {
      if (err) { return next(err); }
      return res.redirect('/ResourceBucket');
    });
  })(req, res, next);
});


app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;

  try {
    const params = {
      TableName: 'Students',
      IndexName: 'Email-index', 
      KeyConditionExpression: 'Email = :email',
      ExpressionAttributeValues: {
        ':email': email
      }
    };

    const data = await docClient.query(params).promise();
    if (data.Items.length > 0) {
      res.redirect("/login");
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
          res.status(500).send("Error hashing password");
        } else {
          const studentID = AWS.util.uuid.v4();

          const params = {
            TableName: 'Students',
            Item: {
              studentID: studentID,
              Email: email,
              password: hash
            }
          };

          try {
            await docClient.put(params).promise();
            req.login({ studentID, Email: email }, (err) => {
              if (err) {
                console.error("Error during login:", err);
                res.status(500).send("Error during login");
              } else {
                console.log("Success");
                res.redirect("/ResourceBucket");
              }
            });
          } catch (err) {
            console.error("Error inserting item:", err);
            res.status(500).send("Error registering user");
          }
        }
      });
    }
  } catch (err) {
    console.error("Error querying DynamoDB:", err);
    res.status(500).send("Error querying user");
  }
});

passport.use("local",
  new Strategy(async function verify(username, password, cb) {
    try {
      const params = {
        TableName: 'Students',
        IndexName: 'Email-index', 
        KeyConditionExpression: 'Email = :email',
        ExpressionAttributeValues: {
          ':email': username
        }
      };

      const data = await docClient.query(params).promise();
      if (data.Items.length > 0) {
        const user = data.Items[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          if (err) {
            console.error("Error comparing passwords:", err);
            return cb(null, false);
          } else {
            if (valid) {
              return cb(null, user);
            } else {
              return cb(null, false, { showAnotherWay: true });
            }
          }
        });
      } else {
        return cb(null, false, {showAnotherWay: false });
      }
    } catch (err) {
      console.log(err);
      return cb(err);
    }
  })
);

app.post('/verify', async (req, res) => {
  const email = req.headers['email'];
  const otp = req.headers['otp'];
  
  console.log('Email from request body:', email);
  console.log('otp recieved is : ',otp);

  const params = {
      TableName: 'OTP',
      Key: {
          email: email
      }
  };
  console.log('Params:', params);  // Debugging output

  try {
    const result = await docClient.get(params).promise();

    if (!result.Item) {
        console.log('error OTP Expired!!');
    } else if (result.Item.otp === otp) {
        await docClient.delete(params).promise();
        console.log('OTP verified successfully!!');

        const user = {
          studentID: result.Item.studentID, 
          Email: email
        };
        
        req.login(user, (err) => {
          if (err) {
            console.error("Error during login:", err);
            return res.status(500).json({ status: 'error', message: 'Error during login' });
          }
        res.status(200).json({ result: 'success' });
      });
      } else {
        res.status(400).json({ result: 'error' });
      }
} catch (error) {
    console.error('Error verifying OTP:', error);
}
});

passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/secrets",
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    async (profile, cb) => {
      try {
        console.log(profile);
        const params = {
          TableName: 'students',
          IndexName: 'Email-index', 
          KeyConditionExpression: 'Email = :email',
          ExpressionAttributeValues: {
            ':email': profile.email
          }
        };

        const data = await docClient.query(params).promise();
        if (data.Items.length === 0) {
          const studentID = AWS.util.uuid.v4();

          const params = {
            TableName: 'students',
            Item: {
              studentID: studentID,
              Email: profile.email,
              password: "google"
            }
          };

          try {
            await docClient.put(params).promise();
            return cb(null, { studentID, Email: profile.email });
          } catch (err) {
            console.error("Error inserting item:", err);
            return cb(err);
          }
        } else {
          return cb(null, data.Items[0]);
        }
      } catch (err) {
        console.error("Error querying DynamoDB:", err);
        return cb(err);
      }
    }
  )
);
passport.serializeUser((user, cb) => {
  cb(null, user);
});
passport.deserializeUser((user, cb) => {
  cb(null, user);
});
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});