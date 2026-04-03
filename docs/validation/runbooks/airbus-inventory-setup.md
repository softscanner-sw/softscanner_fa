# Airbus-Inventory Environment Setup
Authoritative runbook for running the airbus-inventory subject locally.

---

## Prerequisites
- Docker (for MySQL)
- Java 17+ (for Spring Boot backend)
- Node.js 18+ (for Angular frontend)
- Maven wrapper included in backend repo

## 1. MySQL Database (Docker)

```bash
docker run -d --name airbus-mysql \
  -e MYSQL_ROOT_PASSWORD=password \
  -e MYSQL_DATABASE=Product \
  -p 3306:3306 mysql:5.7
```

Wait for MySQL to be ready (~5-10 seconds):
```bash
docker exec airbus-mysql mysqladmin ping -u root -ppassword --silent
```

Seed schema and users:
```bash
docker exec -i airbus-mysql mysql -u root -ppassword Product <<'SQL'
CREATE TABLE IF NOT EXISTS Product(
  productId varchar(256) UNIQUE NOT NULL,
  productName varchar(256),
  productDescription varchar(3500),
  productCategory varchar(256),
  units int
);
CREATE TABLE IF NOT EXISTS User(
  username varchar(256),
  password varchar(256)
);
INSERT IGNORE INTO User VALUES('airbus01','$2a$10$slYQmyNdGzTn7ZLBXBChFOC9f6kFjAqPhccnP6DxlWXx2lPk1C3G6');
INSERT IGNORE INTO User VALUES('airbus02@gmail.com','$2a$10$ZnnAdfh3cc7a/b1aODLeoOjifNPbHL6Vo8kpRJj.muPsVp1697hJO');
SQL
```

### Credential mismatch note
The shipped `schema.sql` has username `airbus02` (plain), but the Angular login form has `Validators.email` requiring email format. The database must use `airbus02@gmail.com` for the frontend form validation to pass. The bcrypt hash is the same (`1234`).

## 2. Spring Boot Backend

```bash
cd C:/Users/basha/git/github/Inventory-Management-System/airbus-management-spring
./mvnw.cmd spring-boot:run
```

Runs on **port 8080**. Verify:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080
# Expected: 401 (auth required — correct)
```

Backend config: `src/main/resources/application.properties`
- `server.port=8080`
- `spring.datasource.url=jdbc:mysql://localhost:3306/Product`
- `spring.datasource.username=root`
- `spring.datasource.password=password`

## 3. Angular Frontend

```bash
cd C:/Users/basha/git/github/Inventory-Management-System/AirbusInventory
NODE_OPTIONS=--openssl-legacy-provider npx ng serve --port 4200
```

`--openssl-legacy-provider` is required because Angular 12's webpack uses a hash algorithm deprecated in Node.js 17+ OpenSSL.

Runs on **port 4200**. Verify:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4200
# Expected: 200
```

## 4. Manifest-Critical Values

| Field | Value | Source |
|---|---|---|
| `baseUrl` | `http://localhost:4200` | Default Angular dev server |
| `authSetup.loginRoute` | `/login` | Angular route config |
| `authSetup.usernameField` | `input[formcontrolname='emailid']` | login-page.component.html |
| `authSetup.passwordField` | `input[formcontrolname='password']` | login-page.component.html |
| `authSetup.submitButton` | `button[type='submit']` | login-page.component.html |
| `accounts[0].username` | `airbus02@gmail.com` | DB User table (email format) |
| `accounts[0].password` | `1234` | DB User table (bcrypt hash) |
| `accounts[0].guardSatisfies` | `["CanActivateRouteGuard"]` | A1 guard analysis |

## 5. Run B3/B4

```bash
cd C:/Users/basha/git/claude/softscanner_fa
npm run b3 -- airbus-inventory
```

## 6. Teardown

```bash
# Stop Angular frontend
# (Ctrl+C in its terminal, or kill the ng serve process)

# Stop Spring Boot backend
# (Ctrl+C in its terminal, or kill the java process)

# Stop and remove MySQL container
docker stop airbus-mysql && docker rm airbus-mysql
```
