//
//  UserProfileViewController.m
//  Pegg
//
//  Created by Bart Lewis on 2/6/15.
//  Copyright (c) 2015 Pegg. All rights reserved.
//

#import "UserProfileHomeViewController.h"
#import "UserProfileFriendsViewController.h"
#import "UserProfilePeggsViewController.h"
#import "UserProfileOptionsViewController.h"
#import "UserProfileEditViewController.h"
#import "ChooseThemeViewController.h"
#import <CustomBadge/CustomBadge.h>

@interface UserProfileHomeViewController () <UIActionSheetDelegate, UIScrollViewDelegate>

@property (weak, nonatomic) IBOutlet UIButton           *followButton;
@property (weak, nonatomic) IBOutlet UIButton           *editProfileButton;
@property (weak, nonatomic) IBOutlet UIButton           *viewBoardButton;
@property (weak, nonatomic) IBOutlet UIView             *avatarContainerView;
@property (weak, nonatomic) IBOutlet UIImageView        *avatarImageView;
@property (weak, nonatomic) IBOutlet UILabel            *usernameLabel;
@property (weak, nonatomic) IBOutlet UILabel            *locationLabel;
@property (weak, nonatomic) IBOutlet UILabel            *peggCollectionLabel;
@property (weak, nonatomic) IBOutlet NSLayoutConstraint *peggsRowHeightConstraint;
@property (weak, nonatomic) IBOutlet UIView *friendsRowView;
@property (weak, nonatomic) IBOutlet UILabel            *friendsLabel;
@property (weak, nonatomic) IBOutlet NSLayoutConstraint *friendsRowHeightConstraint;

@property (weak, nonatomic) IBOutlet UIImageView        *peggImageView;
@property (weak, nonatomic) IBOutlet UIImageView        *friendsImageView;

@property (strong, nonatomic) IBOutlet UIScrollView     *detailsContainerScrollView;
@property (strong, nonatomic) IBOutlet UIPageControl    *detailsPageControl;

@property (strong, nonatomic) IBOutlet UIView           *detailsView;

@property (nonatomic, strong) CustomBadge *requestsBadge;


// BBF view components
@property (strong, nonatomic) IBOutlet UIView           *bbfContainerView;
@property (strong, nonatomic) IBOutlet UIView           *bbfAvatarContainerView;
@property (strong, nonatomic) IBOutlet UILabel          *bbfTitleLabel;
@property (strong, nonatomic) IBOutlet UILabel          *bbfHintLabel;
@property (weak, nonatomic) IBOutlet NSLayoutConstraint *avatarContainerCenterConstraint;


- (IBAction)followButtonAction:(id)sender;
- (IBAction)editProfileButtonAction:(id)sender;
- (IBAction)viewBoardButtonAction:(id)sender;
- (IBAction)peggButtonAction:(id)sender;
- (IBAction)friendsButtonAction:(id)sender;

@property (strong, nonatomic) UserProfileOptionsViewController  *optionsViewController;
@property (strong, nonatomic) UserProfileEditViewController     *editViewController;
@property (strong, nonatomic) UserProfilePeggsViewController    *peggsViewController;
@property (strong, nonatomic) UserProfileFriendsViewController  *friendsViewController;

@property (assign, nonatomic) BOOL isAuthUser;

@end

@implementation UserProfileHomeViewController {

    BOOL _pageControlBeingUsed;

}

// -----------------------------------------------------------------------------
- (void)viewDidLoad
// -----------------------------------------------------------------------------
{
    [super viewDidLoad];

    // add BBF view to scrollable detail area
    [self setupBBFView];

    __weak typeof(self) weakSelf = self;

    // Init the options view.
    _optionsViewController = [[UserProfileOptionsViewController alloc] init];
    if (_onNavigateToViewAction) {
        _optionsViewController.onNavigateToViewAction = _onNavigateToViewAction;
    }
    if (_onPopViewAction) {
        _optionsViewController.onPopViewAction = _onPopViewAction;
    }

    // Init the edit profile view.
    _editViewController = [[UserProfileEditViewController alloc] init];
    _editViewController.onCloseModalAction = ^{
        [weakSelf hideEditProfileModal];
    };

    // Init the peggs controller
    _peggsViewController = [[UserProfilePeggsViewController alloc] init];
    _peggsViewController.user = _user;
    if (_onShowPeggAction) {
        _peggsViewController.onShowPeggAction = _onShowPeggAction;
    }
    if (_onShowAllPeggsAction) {
        _peggsViewController.onShowAllPeggsAction = _onShowAllPeggsAction;
    }

    // Init the friends controller
    _friendsViewController = [[UserProfileFriendsViewController alloc] init];
    _friendsViewController.user = _user;
    if (_onShowDiscoveryPeopleAction) {
        _friendsViewController.onShowDiscoveryPeopleAction = _onShowDiscoveryPeopleAction;
    }

    // Is this the authUser looking at themself?
    self.isAuthUser = [PSAuthenticatedUser isCurrentAuthenticatedUser:_user.userName];

    // Set basic user info
    [self setBasicUserInfo];

    // Do switcheroo on buttons based on if authUser is looking at themself or someone else
    _followButton.hidden = _isAuthUser;
    _editProfileButton.hidden = !_isAuthUser;
    NSString *hintText = @"";
    if (!_isAuthUser) {
        [self setFollowButtonTitle];

        // update BBFs label
        _bbfTitleLabel.text = NSLocalizedString(@"BBFOtherPlaceholder", nil);

        if (_user.isPrivate && !_user.isPrivateBypass) {
            hintText = [NSString stringWithFormat:NSLocalizedString(@"BBFOtherHintPrivatePlaceholder", nil), _user.userName];
        }
        else  {
            hintText = NSLocalizedString(@"BBFOtherHintPlaceholder", nil);
        }
    } else {
        _bbfTitleLabel.text = NSLocalizedString(@"BBFSelfPlaceholder", nil);
        hintText = NSLocalizedString(@"BBFSelfHintPlaceholder", nil);
    }

    NSDictionary *attributes = @{ NSFontAttributeName            : [UIFont systemFontOfSize:15],
                                  NSKernAttributeName            : @(CAPTION_KERNING),
                                  NSForegroundColorAttributeName : [UIColor whiteColor] };

    _bbfHintLabel.attributedText = [[NSAttributedString alloc] initWithString:hintText attributes:attributes];



    // Do we need to reload this user?
    if ([_user getFriendsTotal]==0) {
        [_user reloadUserWithCompletion:^(id object, NSError *error) {
            if (!error) {
                [self setRandomFriendAvatarInRow];
            }
        }];
    }

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(updateRequestsBadge)
                                                 name:PSNotificationUserRequestsDidChange
                                               object:nil];
}

// -----------------------------------------------------------------------------
- (void)viewDidDisappear:(BOOL)animated
// -----------------------------------------------------------------------------
{
    [super viewDidDisappear:animated];

    [[NSNotificationCenter defaultCenter] removeObserver:self name:PSNotificationUserRequestsDidChange object:nil];
}

// -----------------------------------------------------------------------------
- (void)viewWillLayoutSubviews
// -----------------------------------------------------------------------------
{
    [super viewWillLayoutSubviews];
}


// -----------------------------------------------------------------------------
-(void)viewDidLayoutSubviews
// -----------------------------------------------------------------------------
{
    [super viewDidLayoutSubviews];

    [self styleUpControls];

    [self updateRequestsBadge];
}

// -----------------------------------------------------------------------------
- (void) updateViewConstraints
// -----------------------------------------------------------------------------
{
    // Add constraints for detailsContainerScrollView subviews
    UIScrollView *superview = _detailsContainerScrollView;

    NSArray *constraint;
    NSDictionary *metrics = @{ @"width": @(APP_WIDTH) };
    NSDictionary *views   = NSDictionaryOfVariableBindings(_detailsView, _bbfContainerView , superview);

    // Y placement and width
    constraint = [NSLayoutConstraint constraintsWithVisualFormat:@"V:|[_detailsView(==superview)]|"
                                                         options:0
                                                         metrics:metrics
                                                           views:views];
    [_detailsContainerScrollView addConstraints:constraint];


    constraint = [NSLayoutConstraint constraintsWithVisualFormat:@"V:|[_bbfContainerView(==superview)]|"
                                                         options:0
                                                         metrics:metrics
                                                           views:views];
    [_detailsContainerScrollView addConstraints:constraint];


    // X placement and width
    constraint = [NSLayoutConstraint constraintsWithVisualFormat:@"H:|[_detailsView(width)][_bbfContainerView(width)]|"
                                                         options:0
                                                         metrics:metrics
                                                           views:views];
    [_detailsContainerScrollView addConstraints:constraint];

    // Always call super for this method
    [super updateViewConstraints];
}

// -----------------------------------------------------------------------------
-(void)setupBBFView
// -----------------------------------------------------------------------------
{
    _detailsContainerScrollView.autoresizesSubviews             = YES;
    _detailsView.translatesAutoresizingMaskIntoConstraints      = NO;
    _bbfContainerView.translatesAutoresizingMaskIntoConstraints = NO;

    [_detailsContainerScrollView addSubview:_detailsView];
    [_detailsContainerScrollView addSubview:_bbfContainerView];
}

// -----------------------------------------------------------------------------
-(void)setBasicUserInfo
// -----------------------------------------------------------------------------
{
    // Set user info
    _usernameLabel.text = [_user.userName lowercaseString];
    _locationLabel.text = [_user.location lowercaseString];

    // Set the user's avatar
    [Utils startProgressiveAvatarDownloadForUser:_user imageView:_avatarImageView];

    // Set text on controls for authUser vs non-auth
    if (_isAuthUser) {
        [_viewBoardButton setTitle:NSLocalizedString(@"ProfileViewBoardSelf", nil) forState:UIControlStateNormal];
        _peggCollectionLabel.text = NSLocalizedString(@"ProfilePeggCollectionSelf", nil);
        _friendsLabel.text = NSLocalizedString(@"ProfileFriendsSelf", nil);
    }
    else {
        [_viewBoardButton setTitle:NSLocalizedString(@"ProfileViewBoard", nil) forState:UIControlStateNormal];
        _peggCollectionLabel.text = NSLocalizedString(@"ProfilePeggCollection", nil);
        _friendsLabel.text = NSLocalizedString(@"ProfileFriends", nil);
    }

    [self setRandomFriendAvatarInRow];
    [self setRandomPeggInRow];

    [self setupFans];
}

// -----------------------------------------------------------------------------
- (void) setFollowButtonTitle
// -----------------------------------------------------------------------------
{
    NSString *title = @"";

    // Follow button or unfollow button?
    if (_user.isAuthUserFriend) {
        if (_user.isPrivate && !_user.isPrivateBypass) {
            title = NSLocalizedString(@"ButtonRequestedFollow", nil);
        }
        else {
            title = NSLocalizedString(@"ButtonUnfollow", nil);
        }
    }
    else {
        if (_user.isPrivate) {
            title = NSLocalizedString(@"ButtonRequestFollow", nil);
        }
        else {
            title = NSLocalizedString(@"ButtonFollow", nil);
        }
    }

    [_followButton setTitle:title forState:UIControlStateNormal];
}


// -----------------------------------------------------------------------------
- (void) setupFans
// -----------------------------------------------------------------------------
{
    [self.user fetchFansWithCompletion:^(PSUser *user, NSError *error) {

        if (!error) {

            if (user.fans.count > 0) {

                // hide hint label
                self.bbfHintLabel.hidden = YES;


                // setup appropriate Avatar icons for each user
                [self setupAvatarsForFans:user.fans];
            }

        }
        else {
            // @todo Show error?
        }
    }];
}



static const NSInteger kAvatarSpacing = 22;
// -----------------------------------------------------------------------------
- (void) setupAvatarsForFans:(NSArray *)fans
// -----------------------------------------------------------------------------
{
    NSInteger index = 0;
    for (PSUser *user in fans) {

        NSInteger w = ((self.bbfAvatarContainerView.width - (kAvatarSpacing * 2)) / 3);
        NSInteger x = (w + kAvatarSpacing) * (index % 3);
        NSInteger y = 0;
        if (index > 2)  {
            y = w + kAvatarSpacing;
        }

        UIImageView *avatarImageView = [[UIImageView alloc] initWithFrame:CGRectMake(x, y, w, w)];

        // Roundify the avatar container
        avatarImageView.clipsToBounds = YES;
        [avatarImageView.layer setCornerRadius:avatarImageView.size.width * 0.5];
        [_bbfAvatarContainerView addSubview:avatarImageView];

        avatarImageView.tag = index;

        [Utils startProgressiveAvatarDownloadForUser:user imageView:avatarImageView];

        // Roundify the avatar container, and give us a border
        [avatarImageView.layer setBorderColor:[[UIColor whiteColor] CGColor]];
        [avatarImageView.layer setBorderWidth:4.0];
        [avatarImageView.layer setCornerRadius:avatarImageView.size.width * 0.5];


        UITapGestureRecognizer *recognizer = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(fanAvatarTapped:)];
        recognizer.numberOfTapsRequired = 1;
        [avatarImageView addGestureRecognizer:recognizer];
        avatarImageView.userInteractionEnabled = YES;

        index++;
    }
}


// -----------------------------------------------------------------------------
-(void)setRandomFriendAvatarInRow
// -----------------------------------------------------------------------------
{
    // If the user has any friends, lets randomly set one of them on the avatar row.
    if (_user.friends && [_user.friends[kUserArrayEnumerationDataIndex] count] > 0) {
        NSMutableArray *friends = [NSMutableArray arrayWithArray:_user.friends[kUserArrayEnumerationDataIndex]];

        while (friends.count > 0) {
            NSUInteger randomIndex = arc4random() % friends.count;

            PSFriend *friend = friends[randomIndex];

            if (friend.avatarName && friend.avatarName.length) {
                NSString *urlString = [NSString stringWithFormat:@"%@%@/", PEGGSITE_IMAGE_URL, @(friend.userID)];
                urlString = [urlString stringByAppendingString:friend.avatarName];

                [_friendsImageView sd_setImageWithPreviousCachedImageWithURL:[NSURL URLWithString:urlString]
                                                 andPlaceholderImage:[UIImage imageNamed:IMAGE_GENERIC_AVATAR_BIG]
                                                             options:SDWebImageRetryFailed
                                                            progress:nil
                                                           completed:nil];

                break;
            }
            else {
                // That user didn't have an avatar set, lets try another random one.

                [friends removeObjectAtIndex:randomIndex];
            }
        }
    }
}

// -----------------------------------------------------------------------------
-(void)setRandomPeggInRow
// -----------------------------------------------------------------------------
{
    // If the user has any peggs on their board, lets set a random one.
    if (_user.peggs && _user.peggs.count > 0) {
        NSUInteger randomIndex = arc4random() % _user.peggs.count;
        PSPegg *pegg = _user.peggs[randomIndex];

        [self setPeggImage:pegg.imageSource];
    }
}

// -----------------------------------------------------------------------------
- (void)styleUpControls
// -----------------------------------------------------------------------------
{
    struct CGColor *borderColor = [[UIColor whiteColor] CGColor];
    float borderWidth = 1;
    float cornerRadius = 4.0;

    // Draw buttons
    for (UIButton *button in @[_followButton, _editProfileButton, _viewBoardButton]) {
        [button.layer setBorderColor:borderColor];
        [button.layer setBorderWidth:borderWidth];
        [button.layer setCornerRadius:cornerRadius];
    }

    // Adjustments for iPhone 4.
    if (IS_IPHONE4_ASPECT) {
        // Reduce height of rows to give avatar area more room.
        _peggsRowHeightConstraint.constant = 50;
        _friendsRowHeightConstraint.constant = 50;
        _avatarContainerCenterConstraint.constant = -17;
    } else if (IS_IPHONE5_ASPECT) {
        _avatarContainerCenterConstraint.constant = -15;
    } else if (IS_IPHONE6_ASPECT || IS_IPHONE6PLUS_ASPECT) {
        _avatarContainerCenterConstraint.constant = 15;
    }

    // iOS7 needs us to call layoutIfNeeded, otherwise it won't calc constraints yet.
    [self.view layoutIfNeeded];

    // Roundify the avatar container, and give us a border
    [_avatarContainerView.layer setBorderColor:borderColor];
    [_avatarContainerView.layer setBorderWidth:6.0];
    [_avatarContainerView.layer setCornerRadius:_avatarContainerView.size.width * 0.5];

    // Roundify the pegg and user avatar in row button.
    [_peggImageView.layer setCornerRadius:_peggImageView.size.width * 0.5];
    [_friendsImageView.layer setCornerRadius:_friendsImageView.size.width * 0.5];
}

// -----------------------------------------------------------------------------
- (void)setPeggImage:(NSString *)peggImageSource
// -----------------------------------------------------------------------------
{
    NSString *imageURL = [NSString stringWithFormat:@"%@%@", PEGGSITE_PEGG_IMAGE_URL, peggImageSource];

    [_peggImageView sd_setImageWithPreviousCachedImageWithURL:[NSURL URLWithString:imageURL]
                                          andPlaceholderImage:[UIImage imageNamed:IMAGE_DEFAULT_PEGG]
                                                      options:SDWebImageRetryFailed
                                                     progress:nil
                                                    completed:^(UIImage *image, NSError *error, SDImageCacheType cacheType, NSURL *imageURL) {
                                                        // no-op
                                                    }];
}

// -----------------------------------------------------------------------------
-(void)hideEditProfileModal
// -----------------------------------------------------------------------------
{
    [self.navController hideModalViewController:_editViewController];

    // Update username, location, avatar.
    [self setBasicUserInfo];
}

// -------------------------------------------------------------------
- (void) updateRequestsBadge
// -------------------------------------------------------------------
{
    // Only show a badge on the authUser's profile
    if (!_isAuthUser) {
        return;
    }

    PSAuthenticatedUser *authUser = [PSAuthenticatedUser currentAuthenticatedUser];

    if (_requestsBadge) {
        // Remove any previous badge.
        [_requestsBadge removeFromSuperview];
    }

    NSInteger badgeCount = [authUser getRequestsCount];

    if (badgeCount > 0) {
        NSString *badgeString = [NSString stringWithFormat:@"%li", (long)badgeCount];

        self.requestsBadge = [CustomBadge customBadgeWithString:badgeString];
        self.requestsBadge.userInteractionEnabled = NO;
        [_friendsRowView addSubview:_requestsBadge];

        // Position the badge
        NSInteger x = _friendsRowView.frame.size.width - _requestsBadge.frame.size.width - 40;
        NSInteger y = (_friendsRowView.frame.size.height / 2) - (_requestsBadge.frame.size.height / 2);
        _requestsBadge.frame = CGRectMake(
                                          x,
                                          y,
                                          _requestsBadge.frame.size.width,
                                          _requestsBadge.frame.size.height);
    }
}


////////////////////////////////////////////////////////////////////////////////
#pragma mark - UIScrollViewDelegate
////////////////////////////////////////////////////////////////////////////////

// Called for any contentOffset change on the scrollview
// -----------------------------------------------------------------------------
- (void)scrollViewDidScroll:(UIScrollView *)scrollView
// -----------------------------------------------------------------------------
{
    if (!_pageControlBeingUsed) {
        CGFloat pageWidth = scrollView.frame.size.width;

        int page = floor((scrollView.contentOffset.x - pageWidth / 2) / pageWidth) + 1;
        if (page < 0) page = 0;

        _detailsPageControl.currentPage = page;

        if (_onDetailPagePresented) {
            _onDetailPagePresented(page);
        }
    }

}

// -----------------------------------------------------------------------------
- (void)scrollViewWillBeginDragging:(UIScrollView *)scrollView
// -----------------------------------------------------------------------------
{
    _pageControlBeingUsed = NO;
}

// -----------------------------------------------------------------------------
- (void)scrollViewDidEndDecelerating:(UIScrollView *)scrollView
// -----------------------------------------------------------------------------
{
    _pageControlBeingUsed = NO;
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - UIPageControl Support
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (void)scrollToPage:(NSInteger)page
// -----------------------------------------------------------------------------
{
    if (page < 2) {
        CGFloat pageWidth   = _detailsContainerScrollView.frame.size.width;
        CGPoint destination = CGPointMake(pageWidth * page, 0);

        [_detailsContainerScrollView setContentOffset:destination animated:YES];

        if (_onDetailPagePresented) {
            _onDetailPagePresented(page);
        }
    }
    _pageControlBeingUsed = YES;
}



////////////////////////////////////////////////////////////////////////////////
#pragma mark - Actions
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
- (void)fanAvatarTapped:(UITapGestureRecognizer *)recognizer
// -----------------------------------------------------------------------------
{
    if (recognizer.state == UIGestureRecognizerStateEnded) {
        NSInteger index = recognizer.view.tag;
        if (index >= 0 && index < _user.fans.count) {
            PSUser *fan = _user.fans[index];
            [self.navController showBoard:fan.userName isolatedDisplay:YES];
        }
    }
}


// -----------------------------------------------------------------------------
-(IBAction)pageControlAction:(id)sender
// -----------------------------------------------------------------------------
{
    [self scrollToPage:_detailsPageControl.currentPage];
}


// -----------------------------------------------------------------------------
-(IBAction)titleBarRightButtonAction:(id)sender
// -----------------------------------------------------------------------------
{
    if (_isAuthUser) {

        if (_detailsPageControl.currentPage == 0) {
            // Show options.
            if (_onNavigateToViewAction) {
                _onNavigateToViewAction(_optionsViewController);
            }
        } else {
            UIAlertView *alert = [Utils createAlertWithPrefix:@"BoardBumpTallyMessage" placeholders:nil showOther:NO andDelegate:nil];

            [alert show];
        }

    }
    else {
        // Show action sheet.

        UIActionSheet *actionSheet = [[UIActionSheet alloc] initWithTitle:nil
                                                                 delegate:self
                                                        cancelButtonTitle:NSLocalizedString(@"ButtonCancel", nil)
                                                   destructiveButtonTitle:nil
                                                        otherButtonTitles:NSLocalizedString(@"ButtonReportUser", nil), nil];

        actionSheet.destructiveButtonIndex = 0;

        [actionSheet showInView:self.navController.view];

    }
}

// -----------------------------------------------------------------------------
- (IBAction)followButtonAction:(id)sender
// -----------------------------------------------------------------------------
{
    if (_user.isAuthUserFriend) {
        // User is requesting to unfollow this user.

        [self.navController unfriendUser:_user completion:^(BOOL isError) {
            if (!isError) {
                _user.authUserFriend = NO;

                [self setFollowButtonTitle];
            }
        }];
    }
    else {
        // User is requesting to follow this user.

        [self.navController befriendUser:_user completion:^(BOOL isError) {
            if (!isError) {
                _user.authUserFriend = YES;

                [self setFollowButtonTitle];
            }
        }];
    }
}

// -----------------------------------------------------------------------------
- (IBAction)editProfileButtonAction:(id)sender
// -----------------------------------------------------------------------------
{
    [self.navController showModalViewController:_editViewController];
}

// -----------------------------------------------------------------------------
- (IBAction)viewBoardButtonAction:(id)sender
// -----------------------------------------------------------------------------
{
    if (_isAuthUser) {
        ChooseThemeViewController *chooser = [[ChooseThemeViewController alloc] init];
        [self.navController navigateToViewController:chooser animated:YES];
    } else {
        [self.navController showBoard:_user.userName isolatedDisplay:YES];
    }
}

// -----------------------------------------------------------------------------
- (IBAction)peggButtonAction:(id)sender
// -----------------------------------------------------------------------------
{
    if (_onNavigateToViewAction) {
        _onNavigateToViewAction(_peggsViewController);
    }
}

// -----------------------------------------------------------------------------
- (IBAction)friendsButtonAction:(id)sender
// -----------------------------------------------------------------------------
{
    if (_onNavigateToViewAction) {
        _onNavigateToViewAction(_friendsViewController);
    }
}

#pragma mark - Nav Bar Visibility

// -----------------------------------------------------------------------------
- (BOOL)showNav
// -----------------------------------------------------------------------------
{
    return NO;
}

#pragma mark - Tab Bar Visibility

// -----------------------------------------------------------------------------
- (BOOL)showTabs
// -----------------------------------------------------------------------------
{
    return YES;
}

#pragma mark - Spinner Type For View

// -----------------------------------------------------------------------------
- (SpinnerType)spinnerType
// -----------------------------------------------------------------------------
{
    return SpinnerTypeGray;
}

#pragma mark - Nav Bar Title

// -----------------------------------------------------------------------------
- (NSString *)title
// -----------------------------------------------------------------------------
{
    return [_user.userName lowercaseString];
}

////////////////////////////////////////////////////////////////////////////////
#pragma mark - Nav Bar Right Button
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
-(void)setupTitleBarRightButton:(UIButton *)button
// -----------------------------------------------------------------------------
{
    // Set up buttons based on user being viewed
    if (_isAuthUser) {

        // User is looking at their own profile.
        if (_detailsPageControl.currentPage == 0) {
            [button setTitle:nil forState:UIControlStateNormal];
            [button setImage:[UIImage imageNamed:@"gear_icon"] forState:UIControlStateNormal];
            button.contentEdgeInsets = UIEdgeInsetsMake(21, 0, 0, 20);
        } else {

            NSString *tally = [NSString stringWithFormat:@"%@" , @(_user.tally)];

            button.titleLabel.font      = [UIFont fontWithName:FONT_FRANKLIN_GOTHIC_HEAVY size:FONT_SIZE_HEADER_BUTTONS];

            [button setImage:nil forState:UIControlStateNormal];
            [button setTitle:tally forState:UIControlStateNormal];
            [button setTitleColor:[UIColor colorWithHex:0xffac33] forState:UIControlStateNormal];

            button.contentEdgeInsets = UIEdgeInsetsMake(20, 0, 0, 20);
        }

    }
    else {
        // User is looking at someone elses profile.

        [button setImage:[UIImage imageNamed:@"3dots_white_icon"] forState:UIControlStateNormal];
        button.contentEdgeInsets = UIEdgeInsetsMake(10, 0, 0, 0);
    }
    button.alpha = 1;

    // Add tap gesture to the button
    [button removeTarget:nil action:NULL forControlEvents:UIControlEventAllEvents];
    [button addTarget:self action:@selector(titleBarRightButtonAction:) forControlEvents:UIControlEventTouchUpInside];
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
            // Report the user

            [_user reportAsOffensiveWithCompletion:^(id object, NSError *error) {
                UIAlertView *alert;

                if (error) {
                    alert = [Utils createAlertWithPrefix:STRING_USER_REPORTED_ERROR_PREFIX
                                            placeholders:nil
                                               showOther:NO
                                             andDelegate:nil];
                }
                else {
                    alert = [Utils createAlertWithPrefix:STRING_USER_REPORTED_SUCCESS_PREFIX
                                            placeholders:@[_user.userName]
                                               showOther:NO
                                             andDelegate:nil];

                }

                alert.tag = ALERT_TAG_ERROR;
                [alert show];
            }];

            break;
        }

        default:
            break;
    }
}
@end
