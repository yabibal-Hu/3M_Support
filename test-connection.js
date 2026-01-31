// test-cpanel-credentials.js
require("dotenv").config();
const mysql = require("mysql2");

console.log("🔐 Testing cPanel MySQL Credentials\n");

// Test different connection configurations
const testConfigs = [
  {
    name: "Standard 192.250.239.84",
    config: {
      host: "192.250.239.84",
      user: "msccrykr_support_user",
      password: "SXhJ#+D)Oi%fQ$5c",
      database: "msccrykr_support",
      port: 3306,
    },
  },
  {
    name: "192.250.239.84 without port",
    config: {
      host: "192.250.239.84",
      user: "msccrykr_support_user",
      password: "SXhJ#+D)Oi%fQ$5c",
      database: "msccrykr_support",
    },
  },
  {
    name: "With charset",
    config: {
      host: "192.250.239.84",
      user: "msccrykr_support_user",
      password: "SXhJ#+D)Oi%fQ$5c",
      database: "msccrykr_support",
      charset: "utf8mb4",
    },
  },
];

// async function testConnection(config, name) {
//   return new Promise((resolve) => {
//     console.log(`\n🔍 Testing: ${name}`);
//     console.log(
//       `Host: ${config.host}, Database: ${config.database}, User: ${config.user}`,
//     );

//     const connection = mysql.createConnection(config);

//     connection.connect((err) => {
//       if (err) {
//         console.log(`❌ Failed: ${err.code || "Unknown error"}`);
//         console.log(`   Message: ${err.message}`);
//         resolve(false);
//       } else {
//         console.log("✅ Connected successfully!");

//         // Run a test query
//         connection.query(
//           "SELECT DATABASE() as db, USER() as user",
//           (err, results) => {
//             if (err) {
//               console.log("❌ Query failed:", err.message);
//             } else {
//               console.log(`📊 Database: ${results[0].db}`);
//               console.log(`👤 User: ${results[0].user}`);
//             }

//             connection.end();
//             resolve(true);
//           },
//         );
//       }
//     });

//     // Timeout after 10 seconds
//     setTimeout(() => {
//       console.log("⏰ Connection timeout");
//       connection.destroy();
//       resolve(false);
//     }, 10000);
//   });
// }
  async function testConnection() {
    try {
      const connection = await this.getConnection();
      
      // Use query() instead of execute() for compatibility
      connection.query("SELECT 1 as connected, DATABASE() as db, USER() as user", (err, results) => {
        connection.release();
        
        if (err) {
          console.error("❌ Database connection test failed:", err.message);
          return false;
        }
        
        console.log("✅ Database connection test successful");
        console.log(`📊 Database: ${results[0].db}`);
        console.log(`👤 Connected as: ${results[0].user}`);
        return true;
      });
      
    } catch (error) {
      console.error("❌ Database connection test failed:", error.message);
      return false;
    }
  }

async function runAllTests() {
  console.log("=".repeat(60));
  console.log("CPANEL MYSQL CONNECTION TESTS");
  console.log("=".repeat(60));

  let success = false;

  for (const test of testConfigs) {
    success = await testConnection(test.config, test.name);
    if (success) break;
  }

  console.log("\n" + "=".repeat(60));
  if (success) {
    console.log("✅ At least one connection method worked!");
  } else {
    console.log("❌ All connection attempts failed");
    console.log("\n🔧 Next steps:");
    console.log("1. Log into cPanel → MySQL Databases");
    console.log("2. Verify username: msccrykr_support_user");
    console.log("3. Verify database: msccrykr_support");
    console.log("4. Check password in cPanel (copy it directly)");
    console.log("5. Add your IP to Remote MySQL if needed");
  }
  console.log("=".repeat(60));
}

runAllTests();
