# TaskWorkflow Ground Truth Report

Generated: 2026-03-09
Source: `docs/analysis/task-workflow-ground-truth.json`

---

## Cross-Subject Summary

| Subject | GT Count | Unique Triggers | Notes |
|---------|----------|-----------------|-------|
| posts-users-ui-ng | 18 | 18 | All on entry routes |
| heroes-angular | 27 raw / 19 unique | 19 | Shared components (ListHeader, ButtonFooter, Modal) → 1 TW each |
| softscanner-cqa-frontend | 16 | 16 | Single-route app; 2 dialog components via CCC |
| airbus-inventory | 21 | 21 | Dual-trigger logout (routerLink + click = 2 GT entries each) |
| spring-petclinic-angular | 77 raw / 74 unique | 74 | GT-75..77 dedup of GT-64..66 (VisitAddComponent on 2 routes) |
| ever-traduora | 108 | 108 | All extracted (109 TW incl. 1 surplus `(hovered)`) |
| **Total** | **267 raw / 256 unique** | **256** | |

**Abbreviations used in ledger tables:**
CCS = ComponentCallsService, CNR = ComponentNavigatesRoute, nav→ = routerLink/href navigation,
P: = requiredParam, G: = routeGuard, formValid = FormValid atom, vis: = visibleExpr gate, en: = enabledExpr gate.

---

## 1. posts-users-ui-ng

| Metric | Value |
|--------|-------|
| GT count | 18 |
| Entry routes | /posts, /new-post, /users, /users/:id, /new-user, /user-search, /user-availability-schedule |
| App-shell nav | 6 (HeaderComponent routerLinks on all routes) |

| GT ID | Component | Widget | Event | Handler | Effect Closure | Terminal | Constraints | Notes |
|-------|-----------|--------|-------|---------|----------------|----------|-------------|-------|
| GT-01 | HeaderComponent | button | routerLink | — | — | nav→/posts | — | App-shell: Posts |
| GT-02 | HeaderComponent | button | routerLink | — | — | nav→/new-post | — | App-shell: Add New Post |
| GT-03 | HeaderComponent | button | routerLink | — | — | nav→/users | — | App-shell: Users |
| GT-04 | HeaderComponent | button | routerLink | — | — | nav→/new-user | — | App-shell: Add New User |
| GT-05 | HeaderComponent | button | routerLink | — | — | nav→/user-search | — | App-shell: Search Users |
| GT-06 | HeaderComponent | button | routerLink | — | — | nav→/user-availability-schedule | — | App-shell: Schedule |
| GT-07 | PostListItemComponent | button | click | onLoveIt | CCS:PostService.likePost | — | — | Like button |
| GT-08 | PostListItemComponent | button | click | onNotLoveIt | CCS:PostService.dislikePost | — | — | Dislike button |
| GT-09 | PostListItemComponent | button | click | onDelete | CCS:PostService.deletePost, getPosts | — | — | Delete button |
| GT-10 | NewPostComponent | form | submit | onSavePost | CCS:PostService.addPost, getPosts | CNR→/posts | en:postForm.invalid, formValid | Publish post form |
| GT-11 | NewUserComponent | input | change | onFileSelected | — | — | — | Upload avatar (local FileReader) |
| GT-12 | NewUserComponent | form | submit | onSaveUser | CCS:UserService.addUser, getUsers | CNR→/users/:id | en:userForm.invalid, formValid, P:id | Create user form |
| GT-13 | UserListItemComponent | mat-card | click | navigateToUserProfile | — | CNR→/users/:id | P:id | User card nav (composed in /users, /user-search) |
| GT-14 | UserProfileComponent | button | click | toggleBio | — | — | vis:user.bio.length>150 | Read More/Less toggle |
| GT-15 | UserSearchComponent | input | input | onUsersSearchChange | CCS:UserService.searchUsersByEmail | — | — | Search input |
| GT-16 | UserSearchComponent | button | click | clearSearch | — | — | vis:searchEntry | Clear search button |
| GT-17 | UserAvailabilitySchedulerComponent | input | dateChange | closeDatepicker | — | — | — | Datepicker close |
| GT-18 | UserAvailabilitySchedulerComponent | form | submit | onSubmit | — | — | formValid | Save availability form |

**Out of scope:** None.

---

## 2. heroes-angular

| Metric | Value |
|--------|-------|
| GT count (raw) | 27 |
| GT count (unique triggers) | 19 |
| Entry routes | /heroes, /villains, /about |
| App-shell nav | 6 (Nav + HeaderBarBrand + HeaderBarLinks, on all routes) |
| Dedup | ListHeaderComponent, ButtonFooterComponent, ModalComponent shared between /heroes and /villains; A1 emits 1 trigger edge per shared component → 1 TW each |

| GT ID | Component | Widget | Event | Handler | Effect Closure | Terminal | Constraints | Notes |
|-------|-----------|--------|-------|---------|----------------|----------|-------------|-------|
| GT-01 | NavComponent | a | routerLink | — | — | nav→/heroes | — | App-shell nav |
| GT-02 | NavComponent | a | routerLink | — | — | nav→/villains | — | App-shell nav |
| GT-03 | NavComponent | a | routerLink | — | — | nav→/about | — | App-shell nav |
| GT-04 | HeaderBarBrandComponent | a | href | — | — | ext→angular.io | — | Brand link |
| GT-05 | HeaderBarLinksComponent | a | href | — | — | ext→github | — | GitHub link |
| GT-06 | HeaderBarLinksComponent | a | href | — | — | ext→twitter | — | Twitter link |
| GT-07 | ListHeaderComponent | button | click | handleAdd | — | — | — | Heroes: add mode |
| GT-08 | ListHeaderComponent | button | click | handleRefresh | CCS:HeroService.getAll | — | — | Heroes: refresh |
| GT-09 | ButtonFooterComponent | button | click | handleClick | — | — | — | Heroes: delete |
| GT-10 | ButtonFooterComponent | button | click | handleClick | — | — | — | Heroes: edit |
| GT-11 | ButtonFooterComponent | button | click | handleClick | — | — | — | Heroes: cancel |
| GT-12 | ButtonFooterComponent | button | click | handleClick | CCS:HeroService.update/add | — | — | Heroes: save |
| GT-13 | ModalComponent | button | click | onNo | — | — | — | Heroes modal: No |
| GT-14 | ModalComponent | button | click | onYes | CCS:HeroService.delete | — | — | Heroes modal: Yes |
| GT-15 | ListHeaderComponent | button | click | handleAdd | — | — | — | Villains: add (=GT-07 trigger) |
| GT-16 | ListHeaderComponent | button | click | handleRefresh | CCS:VillainService.getAll | — | — | Villains: refresh (=GT-08 trigger) |
| GT-17 | ButtonFooterComponent | button | click | handleClick | — | — | — | Villains: CRUD buttons (=GT-09 trigger) |
| GT-18 | ModalComponent | button | click | onNo | — | — | — | Villains modal: No (=GT-13 trigger) |
| GT-19 | ModalComponent | button | click | onYes | CCS:VillainService.delete | — | — | Villains modal: Yes (=GT-14 trigger) |
| GT-20 | AboutComponent | a | href | — | — | ext→twitter.com/john_papa | — | External link 1/8 |
| GT-21 | AboutComponent | a | href | — | — | external | — | External link 2/8 |
| GT-22 | AboutComponent | a | href | — | — | external | — | External link 3/8 |
| GT-23 | AboutComponent | a | href | — | — | external | — | External link 4/8 |
| GT-24 | AboutComponent | a | href | — | — | external | — | External link 5/8 |
| GT-25 | AboutComponent | a | href | — | — | external | — | External link 6/8 |
| GT-26 | AboutComponent | a | href | — | — | external | — | External link 7/8 |
| GT-27 | AboutComponent | a | href | — | — | external | — | External link 8/8 |

**Dedup mapping:** GT-15=GT-07, GT-16=GT-08, GT-17=GT-09, GT-18=GT-13, GT-19=GT-14 (same A1 trigger edge, different parent context).

**Out of scope:** ngModel bindings on detail inputs; @Output() event bindings on child component tags; plain HTML `router-link` attributes (not Angular [routerLink]).

---

## 3. softscanner-cqa-frontend

| Metric | Value |
|--------|-------|
| GT count | 16 |
| Entry routes | / |
| Dialog components | GoalDetailsComponent, MetricDetailsComponent (via CCC composition) |

| GT ID | Component | Widget | Event | Handler | Effect Closure | Terminal | Constraints | Notes |
|-------|-----------|--------|-------|---------|----------------|----------|-------------|-------|
| GT-01 | MetadataFormComponent | form | submit | onToggle | — | — | — | Metadata form submit/reset |
| GT-02 | MetadataFormComponent | mat-select | selectionChange | onTypeChange | — | — | — | Type dropdown |
| GT-03 | QualityModelComponent | button | click | showGoalDetails | — | — | — | View Details (composite nodes) |
| GT-04 | QualityModelComponent | mat-checkbox | change | toggleGoalSelection | — | — | — | Goal checkbox (composite) |
| GT-05 | QualityModelComponent | button | click | showGoalDetails | — | — | — | View Details (leaf nodes) |
| GT-06 | QualityModelComponent | mat-checkbox | change | toggleGoalSelection | — | — | — | Goal checkbox (leaf) |
| GT-07 | QualityAssessmentComponent | button | click | toggleAssessment | CCS:ApiService.startAssessment | — | — | Start/stop assessment |
| GT-08 | CollapsibleGoalPanelsComponent | mat-expansion-panel | opened | onPanelOpened | — | — | — | Panel open |
| GT-09 | CollapsibleGoalPanelsComponent | mat-expansion-panel | closed | onPanelClosed | — | — | — | Panel close |
| GT-10 | MetricsDashboardComponent | button | click | openMetricDetails | — | — | — | Metric info button |
| GT-11 | MetricsDashboardComponent | ngx-charts-line-chart | select | onLegendClick | — | — | — | Line chart select |
| GT-12 | MetricsDashboardComponent | ngx-charts-bar-vertical | select | onLegendClick | — | — | — | Bar chart select |
| GT-13 | GoalAssessmentOverviewComponent | ngx-charts-line-chart | select | onGoalLegendClick | — | — | — | Goal line chart |
| GT-14 | GoalAssessmentOverviewComponent | ngx-charts-bar-horizontal | select | onMetricLegendClick | — | — | — | Goal bar chart |
| GT-15 | GoalDetailsComponent | button | click | close | — | — | — | Dialog close (via CCC chain) |
| GT-16 | MetricDetailsComponent | button | click | close | — | — | — | Dialog close (via CCC chain) |

**Out of scope:** matTreeNodeToggle directive (CDK internal); ngModel/reactive form implicit bindings; @Output() event bindings (metadataSubmitted, goalsSelected).

---

## 4. airbus-inventory

| Metric | Value |
|--------|-------|
| GT count | 21 |
| Entry routes | /login, /dashboard, /getAllProducts, /productByCategory, /add, /update |
| App-shell nav | 5 (MainNavComponent on all post-login routes) |
| Dialog components | SuccessfulDialogComponent, UnSuccessfulDialogComponent (bootstrap, not route-activated) |
| Dual-trigger elements | GT-06/GT-07 (click) + GT-20/GT-21 (routerLink): logout span+div each have routerLink + click handler → 2 TW each |

| GT ID | Component | Widget | Event | Handler | Effect Closure | Terminal | Constraints | Notes |
|-------|-----------|--------|-------|---------|----------------|----------|-------------|-------|
| GT-01 | LoginPageComponent | form | submit | login | CCS:AuthenticationServiceService.authenticate | CNR→/dashboard | — | Login form |
| GT-02 | MainNavComponent | a | routerLink | — | — | nav→/productByCategory | — | Sidenav: Products by Category |
| GT-03 | MainNavComponent | a | routerLink | — | — | nav→/getAllProducts | — | Sidenav: All Products |
| GT-04 | MainNavComponent | a | routerLink | — | — | nav→/add | — | Sidenav: Add Product |
| GT-05 | MainNavComponent | button | click | — | — | — | — | Sidenav toggle (template-ref drawer.toggle) |
| GT-06 | MainNavComponent | span | click | logout | — | nav→/login | — | Logout icon |
| GT-07 | MainNavComponent | div | click | logout | — | nav→/login | — | Logout text (may be CSS hidden) |
| GT-08 | GetAllProductsComponent | th | click | sort | — | — | — | Sort by ID |
| GT-09 | GetAllProductsComponent | th | click | sort | — | — | — | Sort by Product Name |
| GT-10 | GetAllProductsComponent | th | click | sort | — | — | — | Sort by Description |
| GT-11 | GetAllProductsComponent | th | click | sort | — | — | — | Sort by Category |
| GT-12 | GetAllProductsComponent | th | click | sort | — | — | — | Sort by Units |
| GT-13 | GetAllProductsComponent | span | click | updateProduct | CCS:SharedServiceService.setProduct | CNR→/update | — | Edit product icon |
| GT-14 | GetAllProductsComponent | span | click | deleteProduct | CCS:ProductService.deleteProduct, getAllProducts | — | — | Delete product icon |
| GT-15 | GetProductByCategoryComponent | form | submit | getProductByCategory | CCS:ProductService.getAllProductsByCategory | — | — | Search by category form |
| GT-16 | AddProductComponent | form | submit | addProduct | CCS:ProductService.addProduct | — | — | Add product form |
| GT-17 | UpdateProductComponent | form | submit | updateProduct | CCS:ProductService.updateProduct | — | — | Update product form |
| GT-18 | SuccessfulDialogComponent | button | click | refreshPage | — | CNR→/getAllProducts | — | Success dialog close (bootstrap comp) |
| GT-19 | UnSuccessfulDialogComponent | button | click | refreshPage | — | CNR→/getAllProducts | — | Error dialog close (bootstrap comp) |
| GT-20 | MainNavComponent | span | routerLink | — | — | nav→/login | — | Logout routerLink on span (dual-trigger with GT-06) |
| GT-21 | MainNavComponent | div | routerLink | — | — | nav→/login | — | Logout routerLink on div (dual-trigger with GT-07) |

**Out of scope:** ngModel bindings on UpdateProductComponent form fields.

---

## 5. spring-petclinic-angular

| Metric | Value |
|--------|-------|
| GT count | 77 raw / 74 unique (GT-75..77 dedup GT-64..66) |
| Entry routes | 21 routes (/, /welcome, /owners, /owners/add, /owners/:id, /owners/:id/edit, ...) |
| App-shell nav | 16 (AppComponent: 7 WNR + 9 WTH telemetry) |
| S-LOG handlers | 20 (log() calls logToServer — network telemetry, not purely diagnostic) |
| Non-entry routes | PetEditComponent on /pets/:id/edit (GT-72..74); VisitAddComponent also on /pets/:id/visits/add (GT-75..77 = dedup of GT-64..66) |

| GT ID | Component | Widget | Event | Handler | Effect Closure | Terminal | Constraints | Notes |
|-------|-----------|--------|-------|---------|----------------|----------|-------------|-------|
| GT-01 | AppComponent | a | routerLink | — | — | nav→/welcome | — | Navbar: Home |
| GT-02 | AppComponent | a | click | log | — | — | — | S-LOG on Home link |
| GT-03 | AppComponent | a | click | log | — | — | — | S-LOG on Owners dropdown |
| GT-04 | AppComponent | a | routerLink | — | — | nav→/owners | — | Navbar: All Owners |
| GT-05 | AppComponent | a | click | log | — | — | — | S-LOG on All Owners link |
| GT-06 | AppComponent | a | routerLink | — | — | nav→/owners/add | — | Navbar: Add Owner |
| GT-07 | AppComponent | a | click | log | — | — | — | S-LOG on Add Owner link |
| GT-08 | AppComponent | a | click | log | — | — | — | S-LOG on Vets dropdown |
| GT-09 | AppComponent | a | routerLink | — | — | nav→/vets | — | Navbar: All Vets |
| GT-10 | AppComponent | a | click | log | — | — | — | S-LOG on All Vets link |
| GT-11 | AppComponent | a | routerLink | — | — | nav→/vets/add | — | Navbar: Add Vet |
| GT-12 | AppComponent | a | click | log | — | — | — | S-LOG on Add Vet link |
| GT-13 | AppComponent | a | routerLink | — | — | nav→/pettypes | — | Navbar: Pet Types |
| GT-14 | AppComponent | a | click | log | — | — | — | S-LOG on Pet Types link |
| GT-15 | AppComponent | a | routerLink | — | — | nav→/specialties | — | Navbar: Specialties |
| GT-16 | AppComponent | a | click | log | — | — | — | S-LOG on Specialties link |
| GT-17 | OwnerAddComponent | form | submit | onSubmit | CCS:OwnerService | CNR→/owners | en:form, formValid | Add owner form |
| GT-18 | OwnerAddComponent | button | click | gotoOwnersList | — | CNR→/owners | en:form | Back button |
| GT-19 | OwnerAddComponent | button | click | log | — | — | en:form | S-LOG |
| GT-20 | OwnerDetailComponent | button | click | gotoOwnersList | — | CNR→/owners | — | Back to owners list |
| GT-21 | OwnerDetailComponent | button | click | editOwner | — | CNR→/owners/:id/edit | P:id | Edit owner |
| GT-22 | OwnerDetailComponent | button | click | addPet | — | CNR→/owners/:id/pets/add | P:id | Add pet |
| GT-23 | OwnerEditComponent | button | click | gotoOwnerDetail | — | CNR→/owners/:id | P:id, en:form | Back to detail |
| GT-24 | OwnerEditComponent | button | click | log | — | — | en:form | S-LOG |
| GT-25 | OwnerEditComponent | form | submit | onSubmit | CCS:OwnerService | CNR→/owners/:id | P:id, en:form, formValid | Edit owner form |
| GT-26 | OwnerListComponent | button | click | searchByLastName | CCS:OwnerService ×2 | — | — | Search owners |
| GT-27 | OwnerListComponent | a | routerLink | — | — | nav→/owners/:id | P:id | Owner detail link |
| GT-28 | OwnerListComponent | a | click | onSelect | — | CNR→/owners/:id | P:id | Owner row select |
| GT-29 | OwnerListComponent | button | click | addOwner | — | CNR→/owners/add | — | Add owner button |
| GT-30 | PetAddComponent | form | submit | onSubmit | CCS:PetService | CNR→/owners/:id | P:id, formValid | Add pet form |
| GT-31 | PetAddComponent | button | click | gotoOwnerDetail | — | CNR→/owners/:id | P:id | Back to owner |
| GT-32 | PetAddComponent | button | click | log | — | — | — | S-LOG |
| GT-33 | PetListComponent | button | click | editPet | — | CNR→/pets/:id/edit | P:id, vis:condition | Edit pet |
| GT-34 | PetListComponent | button | click | deletePet | CCS:PetService | — | vis:condition | Delete pet |
| GT-35 | PetListComponent | button | click | addVisit | — | CNR→/pets/:id/visits/add | P:id, vis:condition | Add visit |
| GT-36 | PettypeAddComponent | form | submit | onSubmit | CCS:PetTypeService | — | formValid | Add pet type form |
| GT-37 | PettypeAddComponent | button | click | log | — | — | — | S-LOG |
| GT-38 | PettypeEditComponent | form | submit | onSubmit | CCS:PetTypeService | CNR→/pettypes | formValid | Edit pet type form |
| GT-39 | PettypeEditComponent | button | click | log | — | — | — | S-LOG |
| GT-40 | PettypeEditComponent | button | click | onBack | — | CNR→/pettypes | — | Back |
| GT-41 | PettypeListComponent | button | click | showEditPettypeComponent | — | CNR→/pettypes/:id/edit | P:id | Edit pet type |
| GT-42 | PettypeListComponent | button | click | deletePettype | CCS:PetTypeService | — | — | Delete pet type |
| GT-43 | PettypeListComponent | button | click | gotoHome | — | CNR→/welcome | — | Home |
| GT-44 | PettypeListComponent | button | click | showAddPettypeComponent | — | — | — | Show add form |
| GT-45 | SpecialtyAddComponent | button | click | log | — | — | — | S-LOG |
| GT-46 | SpecialtyAddComponent | form | submit | onSubmit | CCS:SpecialtyService | — | formValid | Add specialty form |
| GT-47 | SpecialtyEditComponent | form | submit | onSubmit | CCS:SpecialtyService | CNR→/specialties | formValid | Edit specialty form |
| GT-48 | SpecialtyEditComponent | button | click | log | — | — | — | S-LOG |
| GT-49 | SpecialtyEditComponent | button | click | onBack | — | CNR→/specialties | — | Back |
| GT-50 | SpecialtyListComponent | button | click | showEditSpecialtyComponent | — | CNR→/specialties/:id/edit | P:id | Edit specialty |
| GT-51 | SpecialtyListComponent | button | click | deleteSpecialty | CCS:SpecialtyService | — | — | Delete specialty |
| GT-52 | SpecialtyListComponent | button | click | gotoHome | — | CNR→/welcome | — | Home |
| GT-53 | SpecialtyListComponent | button | click | showAddSpecialtyComponent | — | — | — | Show add form |
| GT-54 | VetAddComponent | form | submit | onSubmit | CCS:VetService | CNR→/vets | formValid | Add vet form |
| GT-55 | VetAddComponent | button | click | gotoVetList | — | CNR→/vets | — | Back to vet list |
| GT-56 | VetAddComponent | button | click | log | — | — | — | S-LOG |
| GT-57 | VetEditComponent | form | submit | onSubmit | CCS:VetService | CNR→/vets | en:form, formValid | Edit vet form |
| GT-58 | VetEditComponent | button | click | gotoVetList | — | CNR→/vets | en:form | Back (false-positive gate) |
| GT-59 | VetEditComponent | button | click | log | — | — | en:form | S-LOG |
| GT-60 | VetListComponent | button | click | editVet | — | CNR→/vets/:id/edit | P:id | Edit vet |
| GT-61 | VetListComponent | button | click | deleteVet | CCS:VetService | — | — | Delete vet |
| GT-62 | VetListComponent | button | click | gotoHome | — | CNR→/welcome | — | Home |
| GT-63 | VetListComponent | button | click | addVet | — | CNR→/vets/add | — | Add vet |
| GT-64 | VisitAddComponent | form | submit | onSubmit | CCS:VisitService | — | formValid | Add visit form (missing CNR) |
| GT-65 | VisitAddComponent | button | click | gotoOwnerDetail | — | CNR→/owners/:id | P:id | Back to owner |
| GT-66 | VisitAddComponent | button | click | log | — | — | — | S-LOG |
| GT-67 | VisitEditComponent | form | submit | onSubmit | CCS:VisitService | CNR→/owners/:id | P:id, formValid | Edit visit form |
| GT-68 | VisitEditComponent | button | click | gotoOwnerDetail | — | CNR→/owners/:id | P:id | Back to owner |
| GT-69 | VisitEditComponent | button | click | log | — | — | — | S-LOG |
| GT-70 | VisitListComponent | button | click | editVisit | — | CNR→/visits/:id/edit | P:id, vis:condition | Edit visit |
| GT-71 | VisitListComponent | button | click | deleteVisit | CCS:VisitService | — | vis:condition | Delete visit |
| GT-72 | PetEditComponent | form | submit | onSubmit | CCS:PetService | CNR→/owners/:id | P:id, formValid | **Non-entry route** |
| GT-73 | PetEditComponent | button | click | gotoOwnerDetail | — | CNR→/owners/:id | P:id | **Non-entry route** |
| GT-74 | PetEditComponent | button | click | log | — | — | — | **Non-entry** S-LOG |
| GT-75 | VisitAddComponent | form | submit | onSubmit | CCS:VisitService | — | formValid | **Non-entry** /pets/:id/visits/add |
| GT-76 | VisitAddComponent | button | click | gotoOwnerDetail | — | CNR→/owners/:id | P:id | **Non-entry** /pets/:id/visits/add |
| GT-77 | VisitAddComponent | button | click | log | — | — | — | **Non-entry** S-LOG /pets/:id/visits/add |

**Out of scope:** ngModel and reactive form [formControl] bindings with no explicit handler; `log` handler is NOT out of scope (calls logToServer — network telemetry).

**Known issues:**
- GT-64: VisitAddComponent WSF missing CNR to /owners/:id (navigation in async callback not captured).
- GT-72..74: PetEditComponent on /pets/:id/edit — now extracted via child-route enumeration.
- GT-75..77: VisitAddComponent on /pets/:id/visits/add — dedup of GT-64..66 (same trigger edges, additional startRouteId). Does not create separate TaskWorkflows.

---

## 6. ever-traduora

| Metric | Value |
|--------|-------|
| GT count | 108 (all extracted; 109 TW incl. 1 surplus) |
| Entry routes | 12 (/login, /signup, /forgot-password, /reset-password, /user-settings, /, /projects, /projects/:projectId, /projects/:projectId/translations, /404, /\*\*, /auth/callback) |
| Child routes | 9 under /projects/:projectId/ (terms, labels, translations, translations/:localeCode, team, import, export, api, settings) |
| Guards | AuthGuard (9 TW), NoAuthGuard (5 TW) |

| GT ID | Component | Widget | Event | Handler | Effect Closure | Terminal | Constraints | Notes |
|-------|-----------|--------|-------|---------|----------------|----------|-------------|-------|
| GT-01 | ForgotPasswordComponent | form | submit | onSubmit | — | — | en:form/loading, formValid | Forgot password form |
| GT-02 | ForgotPasswordComponent | a | routerLink | — | — | nav→/login | G:NoAuthGuard, en:form/loading | Back to login |
| GT-03 | LoginComponent | a | routerLink | — | — | nav→/signup | G:NoAuthGuard, en:form/loading | Sign up link |
| GT-04 | LoginComponent | a | routerLink | — | — | nav→/forgot-password | G:NoAuthGuard, en:form/loading | Forgot password link |
| GT-05 | LoginComponent | form | submit | onSubmit | — | — | en:form/loading, formValid | Login form |
| GT-06 | ResetPasswordComponent | form | submit | onSubmit | — | — | en:form/loading, formValid | Reset password form |
| GT-07 | ResetPasswordComponent | a | routerLink | — | — | nav→/login | G:NoAuthGuard, en:form/loading | Back to login |
| GT-08 | SignInWithComponent | button | click | signInWithProvider | — | — | — | OAuth sign-in (shared: login, signup) |
| GT-09 | SignupComponent | form | submit | onSubmit | — | — | en:inviteOnly, formValid | Signup form |
| GT-10 | SignupComponent | a | routerLink | — | — | nav→/login | G:NoAuthGuard, en:inviteOnly | Login link |
| GT-11 | UserSettingsComponent | button | click | deleteAccount | — | — | en:form/valid | Delete account |
| GT-12 | UserSettingsComponent | form | submit | updateUserData | — | — | en:form/valid, formValid | Update user data |
| GT-13 | UserSettingsComponent | form | submit | changePassword | — | — | en:form/valid, formValid | Change password |
| GT-14 | NewProjectComponent | form | submit | onSubmit | — | redirect→/projects | G:AuthGuard, en:form/loading, formValid | New project (NgbModal) |
| GT-15 | NewProjectComponent | button | click | (close) | — | redirect→/projects | G:AuthGuard, en:form/loading | Modal cancel |
| GT-16 | NewProjectComponent | button | click | (dismiss) | — | redirect→/projects | G:AuthGuard, en:form/loading | Modal dismiss |
| GT-17 | NewProjectComponent | button | click | open | — | redirect→/projects | G:AuthGuard, en:form/loading | Modal open |
| GT-18 | ProjectCardComponent | a | routerLink | — | — | nav→unresolved [project.id] | G:AuthGuard | Project card nav (dynamic route) |
| GT-19 | ProjectLocalesComponent | a | routerLink | — | — | nav→/:localeCode | P:localeCode, P:projectId | Locale link |
| GT-20 | AppBarComponent | a | routerLink | — | — | nav→/ (redirect→/projects) | G:AuthGuard | Home link (app-shell) |
| GT-21 | AppBarComponent | button | routerLink | — | — | nav→/user-settings | G:AuthGuard | Settings (app-shell) |
| GT-22 | AppBarComponent | button | click | logout | — | — | — | Logout (app-shell) |
| GT-23 | AppBarComponent | button | routerLink | — | — | nav→/projects | G:AuthGuard | Projects (app-shell) |
| GT-24 | NewLocaleComponent | button | click | (close) | — | — | en:!isValid() | Modal cancel |
| GT-25 | NewLocaleComponent | button | click | confirmSelection | — | — | en:!isValid() | Confirm locale |
| GT-26 | NewLocaleComponent | button | click | open | — | — | en:!isValid() | Modal open |
| GT-27 | NewLocaleComponent | button | click | (dismiss) | — | — | en:!isValid() | Modal dismiss |
| GT-28 | NotFoundComponent | a | routerLink | — | — | nav→/ (redirect→/projects) | G:AuthGuard | Home link (404 page) |
| GT-29 | SearchComponent | (custom) | click | (pagination) | — | — | — | Pagination trigger |
| GT-30 | SearchComponent | input | input | (search) | — | — | — | Search input |
| GT-31 | SelectLocaleComponent | input | input | (filter) | — | — | — | Locale filter |
| GT-32 | SelectLocaleComponent | (custom) | click | select | — | — | — | Locale select |

### Parent-route entry triggers (GT-33 to GT-41) — EXTRACTED

| GT ID | Component | Route | Widget | Event | Handler | Notes |
|-------|-----------|-------|--------|-------|---------|-------|
| GT-33 | ProjectContainerComponent | :projectId | button | click | toggleMenu | Sidebar hamburger (parent-route fix) |
| GT-34..41 | ProjectContainerComponent | :projectId | a | routerLink | (terms,translations,labels,team,import,export,api,settings) | Sidebar nav (8 relative routerLinks) |

All 9 entries extracted via parent-route component inclusion fix.

### Child-route triggers (GT-42 to GT-108) — EXTRACTED

| GT ID | Component | Route | Widget | Event | Handler | Notes |
|-------|-----------|-------|--------|-------|---------|-------|
| GT-42 | TermsListComponent | terms | button | click | deleteTerm | |
| GT-43..46 | NewTermComponent | terms | button/form | click/ngSubmit | dismiss/onSubmit/close/open | Modal (4 triggers) |
| GT-47 | LabelsListComponent | labels | button | click | deleteLabel | |
| GT-48..52 | NewLabelComponent | labels | button/form | click/ngSubmit | dismiss/onSubmit/randomColor/close/open | Modal (5 triggers) |
| GT-53..57 | EditLabelComponent | labels | button/form | click/ngSubmit | dismiss/onSubmit/randomColor/close/open | Modal (5 triggers) |
| GT-58 | LabelComponent | labels | button | click | onRemove | Shared |
| GT-59..62 | TranslationsListComponent | translations/:localeCode | input/button | change/click/routerLink | onFiltersChanged/deleteLocale/removeRef/terms | 4 triggers |
| GT-63..67 | SelectLocaleModalComponent | translations/:localeCode | button | click | dismiss/close/confirm/open×2 | Modal (5 triggers) |
| GT-68..71 | AddTeamMemberComponent | team | form/button | submit/click | addTeamMember/dismiss/close/open | Modal (4 triggers) |
| GT-72..73 | TeamMemberComponent | team | button | click | edit.emit/remove.emit | 2 triggers |
| GT-74..75 | TeamInviteComponent | team | button | click | edit.emit/remove.emit | 2 triggers |
| GT-76..82 | ImportLocaleComponent | import | button/div/input | click/drop/change | reset/navigate/remove/cancel/import/drop/file | 7 triggers |
| GT-83 | ExportLocaleComponent | export | button | click | export | 1 trigger |
| GT-84..90 | AddApiClientComponent | api | form/button | submit/click | addApiClient/dismiss/close/copy×2/ok/open | Modal (7 triggers) |
| GT-91..93 | ApiClientComponent | api | button | click | edit.emit/remove.emit/copy | 3 triggers |
| GT-94..96 | ProjectSettingsComponent | settings | form/button | ngSubmit/routerLink/click | onSubmit/back/onDelete | 3 triggers |
| GT-97..102 | EditableTextComponent | terms,translations/:lc | textarea/button | input/click/keyup.*/keyup.esc/click×2 | (various) | Shared (6 triggers) |
| GT-103..106 | AssignedLabelsComponent | terms,translations/:lc | button | click | dismiss/close/confirm/open | Shared modal (4 triggers) |
| GT-107..108 | SelectLabelComponent | terms,translations/:lc,labels | input/li | keyup/click | text$.next/select | Shared (2 triggers) |

All 67 child-route entries (GT-42..108) now extracted via child-route enumeration extension.
1 surplus trigger: `(hovered)` on drag-drop div in ImportLocaleComponent (GT policy §0.2 excludes as UI feedback).

**Known issues:**
- GT-18: Unresolved navigation target (dynamic [project.id] expression).

---

## Appendix: Methodology

Ground truth was established by manual source-code audit of templates, handlers, routing, and service calls per subject. GT reflects "what a user can do" — actual user-visible interaction sites, not framework-internal bindings.

Entries excluded from GT:
- `[(ngModel)]` two-way bindings (framework data binding, not user triggers)
- `@Output()` event bindings on child component selector tags (EventEmitter plumbing)
- CDK/Material directive-only interactions with no explicit handler
- `ngModelChange`, `valuechange`, and other framework-internal events
