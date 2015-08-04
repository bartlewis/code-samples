//
//  FacebookFriendsViewController.m
//  Pegg
//
//  Created by Pegg on 5/28/14.
//  Copyright (c) 2014 Pegg. All rights reserved.
//

#import "FacebookFriendsViewController.h"
#import "ShareFriendCell.h"
#import "FollowButton.h"
#import "PSFacebookUser.h"
#import "LoaderCell.h"
#import <Social/Social.h>

@interface FacebookFriendsViewController ()
<UITableViewDataSource, UITableViewDelegate, ShareFriendCellDelegate, UIActionSheetDelegate, UIAlertViewDelegate>

@property (weak, nonatomic) IBOutlet UIView *loadingView;
@property (nonatomic, weak) IBOutlet UITableView *fbFriendTableView;
@property (weak, nonatomic) IBOutlet UILabel *emptyTableLabel;

@property (nonatomic, strong) NSString *facebookNextUrl;
@property (nonatomic, strong) NSMutableArray *facebookUsers;
@property (nonatomic, strong) NSMutableArray *peggsiteUsers;
@property (nonatomic, strong) UIImage *defaultProfileImage;
@property (nonatomic, strong) PSFacebookUser *facebookUser;
@property (nonatomic, assign) BOOL isGettingUsers;

@property (strong, nonatomic) ShareFriendCell *addingFriendFromCell;
@property (strong, nonatomic) PSUser          *addingFriend;

@end

@implementation FacebookFriendsViewController

// -----------------------------------------------------------------------------
- (instancetype)init
// -----------------------------------------------------------------------------
{
    self = [super initWithNibName:@"FacebookFriendsViewController" bundle:nil];
    if (self) {

    }
    return self;
}

// -----------------------------------------------------------------------------
- (void)viewDidLoad
// -----------------------------------------------------------------------------
{
    [super viewDidLoad];

    // Init arrays
    self.peggsiteUsers = [@[] mutableCopy];
    self.facebookUsers = [@[] mutableCopy];

    self.defaultProfileImage = [UIImage imageNamed:IMAGE_GENERIC_AVATAR];

    UINib *nib = [UINib nibWithNibName:@"ShareFriendCell" bundle:[NSBundle mainBundle]];
    [_fbFriendTableView registerNib:nib forCellReuseIdentifier:SHARE_FRIEND_CELL_IDENTIFIER];

    nib = [UINib nibWithNibName:@"LoaderCell" bundle:[NSBundle mainBundle]];
    [_fbFriendTableView registerNib:nib forCellReuseIdentifier:LOADER_CELL_IDENTIFIER];

    self.shouldHideLoader = YES;

    // Set the current facebook user
    self.facebookUser = [[DataManager sharedInstance] currentFacebookUser];

    // Is the facebook user connected?
    if ([self.facebookUser isSessionActive]) {
        [self getUsers];
    }
    else {
        // Lets ask the user to connect their facebook.
        UIAlertView *alert = [Utils createAlertWithPrefix:STRING_ALLOW_FACEBOOK_PREFIX
                                             placeholders:nil
                                                showOther:YES
                                              andDelegate:self];
        alert.tag = ALERT_TAG_CONFIRM;
        [alert show];
    }
}

// -----------------------------------------------------------------------------
- (void)viewDidFocus
// -----------------------------------------------------------------------------
{
    //    METHOD_LOG

    [super viewDidFocus];

    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(facebookSessionChanged:) name:PSNotificationFacebookSessionStateChanged object:nil];
}

// -----------------------------------------------------------------------------
- (void)viewDidBlur
// -----------------------------------------------------------------------------
{
    //    METHOD_LOG

    [super viewDidBlur];

    // Remove observer
    [[NSNotificationCenter defaultCenter] removeObserver:self name:PSNotificationFacebookSessionStateChanged object:nil];
}

// -----------------------------------------------------------------------------
- (void)didReceiveMemoryWarning
// -----------------------------------------------------------------------------
{
    [super didReceiveMemoryWarning];
    // Dispose of any resources that can be recreated.
}

// -----------------------------------------------------------------------------
- (NSString *)getRealNameFromFacebookData:(NSString *)facebookUserId
// -----------------------------------------------------------------------------
{
    for (FBGraphObject<FBGraphUser> *user in self.facebookUsers) {
        if ([facebookUserId isEqualToString:user.objectID]) {
            return user.name;
        }
    }

    return @"";
}

// -----------------------------------------------------------------------------
- (void)getUsers
// -----------------------------------------------------------------------------
{
    if (!self.isGettingUsers) {
        self.isGettingUsers = YES;

        [self.facebookUser getFriends:self.facebookNextUrl completion:^(NSArray *users, NSString *nextUrl, NSError *error) {
            if (!error) {
                // Set facebookNextUrl, so we can get the next page.
                self.facebookNextUrl = nextUrl;

                // Hold on to the list of users returned from facebook
                if (self.facebookUsers.count==0) {
                    // Page 1, just jam the entire array in.
                    self.facebookUsers = [users mutableCopy];
                }
                else {
                    // We are paging, append the array.
                    [self.facebookUsers addObjectsFromArray:users];
                }

                NSMutableArray *facebookUserIds = [NSMutableArray array];

                // Iterate through users (only users in this page!) and fill up the facebookUserIds array
                for (FBGraphObject<FBGraphUser> *user in users) {
                    [facebookUserIds addObject:user.objectID];
                }

                if (facebookUserIds.count==0) {
                    // There is nothing to fetch from pegg. Done.
                    [self reloadTableView];
                }
                else {
                    // This requests matches the page size of the facebook request, to simplify things.
                    // Paging is done on Facebook end, and this endpoint will always just get one page.
                    [[DataManager sharedInstance] searchUsersWithFacebookIds:facebookUserIds offset:0 limit:FACEBOOK_FRIENDS_PAGE_SIZE completion:^(NSInteger requestType, id data, NSError *error) {
                        if (!error) {
                            if (data && [(NSArray *)data count]==2) {
                                // Convert raw user data into PSUser instances
                                for (NSDictionary *dict in data[kUserArrayEnumerationDataIndex]) {
                                    PSUser *user = [[PSUser alloc] initWithDictionary:dict];

                                    [self.peggsiteUsers addObject:user];
                                }
                            }
                        }

                        // Pegg request done.
                        [self reloadTableView];
                    }];
                }
            }
        }];
    }
}

// -----------------------------------------------------------------------------
-(void)reloadTableView
// -----------------------------------------------------------------------------
{
    BOOL isRows = (self.peggsiteUsers.count > 0);

    // Hide the loading view
    self.loadingView.hidden = YES;

    // Hide the empty message or the table itself.
    self.emptyTableLabel.hidden = isRows;
    self.fbFriendTableView.hidden = !isRows;

    self.isGettingUsers = NO;
    [self.fbFriendTableView reloadData];
}

// -----------------------------------------------------------------------------
-(void)addFriend
// -----------------------------------------------------------------------------
{
    PSAuthenticatedUser *authUser = [PSUser currentAuthenticatedUser];

    if (_addingFriend && _addingFriendFromCell) {
        [authUser addUserToFriends:_addingFriend
                        completion:^(id object, NSError *error) {
                            if (error) {
                                UIAlertView *alert = [Utils createAlertWithPrefix:STRING_CONTENT_UPDATE_ERROR_PREFIX
                                                                     placeholders:nil
                                                                        showOther:NO
                                                                      andDelegate:nil];
                                alert.tag = ALERT_TAG_ERROR;
                                [alert show];
                            }
                        }];

        // Reflect UI and local data
        [_addingFriendFromCell.followButton
         setIsAuthUserFriend:YES
         andIsPrivateBypass:_addingFriend.isPrivateBypass];

        _addingFriend.authUserFriend = YES;
    }

    self.addingFriend = nil;
    self.addingFriendFromCell = nil;
}


////////////////////////////////////////////////////////////////////////////////
#pragma mark - Actions
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
-(IBAction)titleBarRightButtonAction:(id)sender
// -----------------------------------------------------------------------------
{
    UIActionSheet *actionSheet = [[UIActionSheet alloc] initWithTitle:nil
                                                             delegate:self
                                                    cancelButtonTitle:NSLocalizedString(@"ButtonCancel", nil)
                                               destructiveButtonTitle:nil
                                                    otherButtonTitles:NSLocalizedString(@"ButtonDisconnectFacebook", nil), nil];
    [actionSheet showInView:self.view];
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - NSNotification Methods
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (void)facebookSessionChanged:(NSNotification *) notification
// -----------------------------------------------------------------------------
{
    if ([self.facebookUser isSessionActive]) {
        // Session was opened, lets get some users.

        [self getUsers];
    }
    else {
        // Session was closed, back out

        if (_onPopViewAction) {
            _onPopViewAction(self);
        }
    }
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - UITableView Delegate Methods
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView
// -----------------------------------------------------------------------------
{
    return 1;
}

// -----------------------------------------------------------------------------
- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section
// -----------------------------------------------------------------------------
{
    NSInteger rowCount = [self.peggsiteUsers count];

    if (self.facebookNextUrl) {
        rowCount++;
    }

    return rowCount;
}

// -----------------------------------------------------------------------------
- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath
// -----------------------------------------------------------------------------
{
    if (indexPath.row < [self.peggsiteUsers count]) {
        ShareFriendCell *cell = [tableView dequeueReusableCellWithIdentifier:SHARE_FRIEND_CELL_IDENTIFIER];

        cell.delegate = self;

        PSUser *user = self.peggsiteUsers[indexPath.row];

        // Get their "real" name from Facebook.
        NSString *facebookName = [self getRealNameFromFacebookData:user.facebookUserId];

        // Set the user on the cell with with the facebool name as the subtext.
        [cell setUser:user withSubtext:facebookName];

        return cell;
    }
    else {
        LoaderCell *cell = [tableView dequeueReusableCellWithIdentifier:LOADER_CELL_IDENTIFIER];
        [cell startAnimating];

        return cell;
    }
}

// -----------------------------------------------------------------------------
- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath
// -----------------------------------------------------------------------------
{
    [tableView deselectRowAtIndexPath:indexPath animated:YES];

    if (indexPath.row >= self.peggsiteUsers.count) {
        // tapped on loading cell. nothing to do.
        return;
    }

    // Load the user's board
    PSUser *user = self.peggsiteUsers[indexPath.row];
    [self.navController showBoard:user.userName isolatedDisplay:YES];

}

// -----------------------------------------------------------------------------
- (void)tableView:(UITableView *)tableView willDisplayCell:(UITableViewCell *)cell forRowAtIndexPath:(NSIndexPath *)indexPath
// -----------------------------------------------------------------------------
{
    // Make sure the separator insets hit the left and right edge (no margin).
    [Utils setSeparatorInsetZero:tableView tableViewCell:cell];

    if (cell.tag == LOADING_CELL_TAG) {
        [self getUsers];
    }
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - Nav Bar Right Button
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
-(void)setupTitleBarRightButton:(UIButton *)button
// -----------------------------------------------------------------------------
{
    // Show a gear icon.
    [button setImage:[UIImage imageNamed:@"gear_icon"] forState:UIControlStateNormal];
    button.contentEdgeInsets = UIEdgeInsetsMake(21, 0, 0, 20);
    button.alpha = 1;

    // Add tap gesture to the button.
    [button addTarget:self action:@selector(titleBarRightButtonAction:) forControlEvents:UIControlEventTouchUpInside];
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - FollowCellDelegate Methods
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (void)shareFriendCell:(ShareFriendCell *)cell didSelectIndex:(NSInteger)index
// -----------------------------------------------------------------------------
{
    PSAuthenticatedUser *authUser = [PSUser currentAuthenticatedUser];

    PSUser *user;

    // Which user?
    for (user in self.peggsiteUsers) {
        if (cell.user.userID==user.userID) {
            break;
        }
    }

    // Send request to server for follow/unfollow
    if (user.isAuthUserFriend) {
        [authUser removeUserFromFriends:user
                             completion:^(id object, NSError *error) {
                                 if (error) {
                                     UIAlertView *alert = [Utils createAlertWithPrefix:STRING_CONTENT_UPDATE_ERROR_PREFIX
                                                                          placeholders:nil
                                                                             showOther:NO
                                                                           andDelegate:nil];
                                     alert.tag = ALERT_TAG_ERROR;
                                     [alert show];
                                 }
                             }];

        // Reflect UI and local data
        [cell.followButton setIsAuthUserFriend:NO andIsPrivateBypass:user.isPrivateBypass];
        user.authUserFriend = NO;
    }
    else {
        self.addingFriend = user;
        self.addingFriendFromCell = cell;

        // Following a private user throws a confirm dialog.
        if (user.isPrivate) {
            UIAlertView *alert = [Utils createAlertWithPrefix:STRING_FOLLOW_REQUEST_CONFIRM_PREFIX
                                                 placeholders:nil
                                                    showOther:YES
                                                  andDelegate:self];
            alert.tag = ALERT_TAG_FOLLOW_REQUEST;
            [alert show];
        }
        else {
            [self addFriend];
        }
    }
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - UIActionSheet Delegate Methods
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (void)actionSheet:(UIActionSheet *)actionSheet clickedButtonAtIndex:(NSInteger)buttonIndex
// -----------------------------------------------------------------------------
{

    switch (buttonIndex) {
        case 0: {
            // Disconnect Facebook
            [self.facebookUser closeSession:YES];

            break;
        }

        default:
            break;
    }

}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - UIAlertViewDelegate Methods
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (void)alertView:(UIAlertView *)alertView didDismissWithButtonIndex:(NSInteger)buttonIndex
// -----------------------------------------------------------------------------
{
    if (alertView.tag == ALERT_TAG_CONFIRM) {
        if (buttonIndex > 0) {
            // Yes, connect Facebook

            [self.facebookUser openSession];
        }
        else {
            // No, do not connect Facebook.

            if (_onPopViewAction) {
                _onPopViewAction(self);
            }
        }
    }
    else if (alertView.tag == ALERT_TAG_FOLLOW_REQUEST) {
        if (buttonIndex == 1) {
            [self addFriend];
        }
    }
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - Nav Bar Visibility
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (BOOL)showNav
// -----------------------------------------------------------------------------
{
    return YES;
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - Tab Bar Visibility
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (BOOL)showTabs
// -----------------------------------------------------------------------------
{
    return NO;
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - Spinner Type For View
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (SpinnerType)spinnerType
// -----------------------------------------------------------------------------
{
    return SpinnerTypeGray;
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - Nav Bar Title
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (NSString *)title
// -----------------------------------------------------------------------------
{
    return NSLocalizedString(@"TitleFacebookFriends", @"");
}

@end
